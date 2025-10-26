// src/app/api/youtube/channel/route.ts
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type ChannelStatsRow = {
  subscriber_count: number | null;
  view_count: number | null;
  video_count: number | null;
  channels: {
    id: string;
    title: string;
    custom_url?: string | null;
    thumbnail_url?: string | null;
    country?: string | null;
    etag?: string | null;
  } | null;
};

type Channel = {
  id: string;
  title: string;
  channelUrl?: string;
  customUrl?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
};

type YouTubeChannel = {
  id: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
  country?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  etag?: string;
};

const KEYWORD = "Vtuber";
const MAX_RESULTS = 100;
const PAGE_SIZE = 30;
const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const CHUNK_SIZE = 50; // YouTube Data API limit per request
const COUNTRY_CODE = "JP";
const MAX_ALLOWED_SUBSCRIBERS = 10_000;

const numberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const num = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const getSupabaseClient = (): SupabaseClient | null => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
};

const buildChannelUrl = (channel: ChannelStatsRow["channels"]) => {
  if (!channel) return undefined;
  const urlCandidate = channel.custom_url ?? undefined;
  if (typeof urlCandidate === "string" && urlCandidate.length > 0) {
    if (/^https?:\/\//i.test(urlCandidate)) return urlCandidate;
    if (urlCandidate.startsWith("@")) return `https://www.youtube.com/${urlCandidate}`;
    return `https://www.youtube.com/c/${urlCandidate}`;
  }
  if (channel.id) {
    return `https://www.youtube.com/channel/${channel.id}`;
  }
  return undefined;
};

const parseBound = (value: string | null, fallback: number) => {
  if (value === null || value.trim() === "") return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("Invalid numeric parameter");
  }
  return Math.floor(num);
};

const parsePage = (value: string | null): number => {
  if (value === null || value.trim() === "") return 1;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return 1;
  return Math.floor(num);
};

const fetchChannelsFromSupabase = async (
  supabase: SupabaseClient,
  minSubscribers: number,
  maxSubscribers: number,
  page: number,
  pageSize: number
): Promise<{ items: Channel[]; total: number }> => {
  const offset = (page - 1) * pageSize;

  const { data, error, count } = await supabase
    .from("channel_stats")
    .select(
      `
        subscriber_count,
        view_count,
        video_count,
        channels:channels!inner (
          id,
          title,
          custom_url,
          thumbnail_url,
          country,
          etag
        )
      `
    , { count: "exact" })
    .gte("subscriber_count", minSubscribers)
    .lte("subscriber_count", maxSubscribers)
    .not("channels.title", "ilike", "%切り抜き%")
    .order("channel_id", { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (error) {
    throw new Error(error.message);
  }

  const items = (data ?? [])
    .map((row: ChannelStatsRow) => {
      const channel = row.channels;
      if (!channel?.id) return null;

      return {
        id: channel.id,
        title: channel.title ?? channel.id,
        channelUrl: buildChannelUrl(channel),
        customUrl: channel.custom_url ?? undefined,
        thumbnailUrl: channel.thumbnail_url ?? undefined,
        subscriberCount: row.subscriber_count ?? undefined,
        viewCount: row.view_count ?? undefined,
        videoCount: row.video_count ?? undefined,
      };
    })
    .filter((item): item is Channel => item !== null);

  return { items, total: count ?? items.length };
};

const fetchYouTubeChannels = async (apiKey: string): Promise<YouTubeChannel[]> => {
  const collected: YouTubeChannel[] = [];
  const seen = new Set<string>();
  let nextPageToken: string | undefined;

  while (collected.length < MAX_RESULTS) {
    const remaining = MAX_RESULTS - collected.length;
    const searchUrl = new URL(SEARCH_ENDPOINT);
    searchUrl.searchParams.set("part", "id");
    searchUrl.searchParams.set("q", KEYWORD);
    searchUrl.searchParams.set("type", "channel");
    searchUrl.searchParams.set("maxResults", Math.min(CHUNK_SIZE, remaining).toString());
    searchUrl.searchParams.set("key", apiKey);
    searchUrl.searchParams.set("regionCode", COUNTRY_CODE);
    searchUrl.searchParams.set("relevanceLanguage", "ja");
    if (nextPageToken) searchUrl.searchParams.set("pageToken", nextPageToken);

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      const detail = await searchRes.text();
      throw new Error(`YouTube search API error: ${searchRes.status} ${detail}`);
    }

    const searchData = await searchRes.json();
    const candidateIds: string[] = [];
    for (const item of searchData.items ?? []) {
      const id = item?.id?.channelId;
      if (!id || seen.has(id)) continue;
      candidateIds.push(id);
      seen.add(id);
      if (candidateIds.length >= remaining) break;
    }

    if (candidateIds.length === 0) {
      nextPageToken = searchData.nextPageToken;
      if (!nextPageToken) break;
      continue;
    }

    const detailUrl = new URL(CHANNELS_ENDPOINT);
    detailUrl.searchParams.set("part", "snippet,statistics");
    detailUrl.searchParams.set("id", candidateIds.join(","));
    detailUrl.searchParams.set("key", apiKey);

    const detailRes = await fetch(detailUrl.toString());
    if (!detailRes.ok) {
      const detail = await detailRes.text();
      throw new Error(`YouTube channels API error: ${detailRes.status} ${detail}`);
    }

    const detailData = await detailRes.json();
    const detailMap = new Map<string, YouTubeChannel>();
    for (const item of detailData.items ?? []) {
      const id = item?.id;
      if (!id) continue;
      const snippet = item.snippet ?? {};
      const statistics = item.statistics ?? {};
      const subscriberCount = statistics.hiddenSubscriberCount
        ? undefined
        : numberOrUndefined(statistics.subscriberCount);

      detailMap.set(id, {
        id,
        title: snippet.title ?? id,
        customUrl: snippet.customUrl ?? undefined,
        thumbnailUrl:
          snippet.thumbnails?.high?.url ??
          snippet.thumbnails?.medium?.url ??
          snippet.thumbnails?.default?.url ??
          undefined,
        country: snippet.country ?? undefined,
        subscriberCount,
        viewCount: numberOrUndefined(statistics.viewCount),
        videoCount: numberOrUndefined(statistics.videoCount),
        etag: item.etag ?? undefined,
      });
    }

    for (const id of candidateIds) {
      const channel = detailMap.get(id);
      if (!channel) continue;
      collected.push(channel);
    }

    nextPageToken = searchData.nextPageToken;
    if (!nextPageToken) break;
  }

  return collected.slice(0, MAX_RESULTS);
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  let minSubscribers = 0;
  let maxSubscribers = MAX_ALLOWED_SUBSCRIBERS;
  const page = parsePage(url.searchParams.get("page"));

  try {
    minSubscribers = parseBound(url.searchParams.get("minSubscribers"), 0);
    maxSubscribers = parseBound(url.searchParams.get("maxSubscribers"), MAX_ALLOWED_SUBSCRIBERS);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid query parameter";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (minSubscribers > MAX_ALLOWED_SUBSCRIBERS) {
    return NextResponse.json(
      { error: `minSubscribers must be less than or equal to ${MAX_ALLOWED_SUBSCRIBERS}` },
      { status: 400 }
    );
  }

  if (maxSubscribers > MAX_ALLOWED_SUBSCRIBERS) {
    maxSubscribers = MAX_ALLOWED_SUBSCRIBERS;
  }

  if (minSubscribers > maxSubscribers) {
    return NextResponse.json(
      { error: "minSubscribers must be less than or equal to maxSubscribers" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server is not configured with Supabase credentials" },
      { status: 500 }
    );
  }

  try {
    const { items, total } = await fetchChannelsFromSupabase(
      supabase,
      minSubscribers,
      maxSubscribers,
      page,
      PAGE_SIZE
    );
    return NextResponse.json({ items, page, pageSize: PAGE_SIZE, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load channels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let minSubscribers = 0;
  let maxSubscribers = MAX_ALLOWED_SUBSCRIBERS;
  const page = parsePage(url.searchParams.get("page"));

  try {
    minSubscribers = parseBound(url.searchParams.get("minSubscribers"), 0);
    maxSubscribers = parseBound(url.searchParams.get("maxSubscribers"), MAX_ALLOWED_SUBSCRIBERS);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid query parameter";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (minSubscribers > MAX_ALLOWED_SUBSCRIBERS) {
    return NextResponse.json(
      { error: `minSubscribers must be less than or equal to ${MAX_ALLOWED_SUBSCRIBERS}` },
      { status: 400 }
    );
  }

  if (maxSubscribers > MAX_ALLOWED_SUBSCRIBERS) {
    maxSubscribers = MAX_ALLOWED_SUBSCRIBERS;
  }

  if (minSubscribers > maxSubscribers) {
    return NextResponse.json(
      { error: "minSubscribers must be less than or equal to maxSubscribers" },
      { status: 400 }
    );
  }

  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  if (!youtubeApiKey) {
    return NextResponse.json(
      { error: "Server is not configured with YOUTUBE_API_KEY" },
      { status: 500 }
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server is not configured with Supabase credentials" },
      { status: 500 }
    );
  }

  try {
    const channels = await fetchYouTubeChannels(youtubeApiKey);

    const channelRows = channels.map((channel) => ({
      id: channel.id,
      title: channel.title,
      custom_url: channel.customUrl ?? null,
      thumbnail_url: channel.thumbnailUrl ?? null,
      country: channel.country ?? null,
      etag: channel.etag ?? null,
    }));

    const statsRows = channels.map((channel) => ({
      channel_id: channel.id,
      subscriber_count: channel.subscriberCount ?? null,
      view_count: channel.viewCount ?? null,
      video_count: channel.videoCount ?? null,
    }));

    if (channelRows.length > 0) {
      const { error: channelError } = await supabase.from("channels").upsert(channelRows, { onConflict: "id" });
      if (channelError) throw new Error(channelError.message);
    }

    if (statsRows.length > 0) {
      const { error: statsError } = await supabase
        .from("channel_stats")
        .upsert(statsRows, { onConflict: "channel_id" });
      if (statsError) throw new Error(statsError.message);
    }

    const { items, total } = await fetchChannelsFromSupabase(
      supabase,
      minSubscribers,
      maxSubscribers,
      page,
      PAGE_SIZE
    );
    return NextResponse.json({
      refreshed: channels.length,
      items,
      page,
      pageSize: PAGE_SIZE,
      total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh channels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

const MAX_ALLOWED_SUBSCRIBERS = 10_000;

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

const fetchChannelsFromSupabase = async (
  supabase: SupabaseClient,
  minSubscribers: number,
  maxSubscribers: number
): Promise<Channel[]> => {
  const { data, error } = await supabase
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
    )
    .gte("subscriber_count", minSubscribers)
    .lte("subscriber_count", maxSubscribers)
    .not("channels.title", "ilike", "%切り抜き%");

  if (error) {
    throw new Error(error.message);
  }

  const rows: ChannelStatsRow[] = (data ?? []) as unknown as ChannelStatsRow[];
  const items: Channel[] = [];

  for (const row of rows) {
    const channel = row.channels;
    if (!channel?.id) continue;
    if (channel.title?.includes("切り抜き")) continue;

    items.push({
      id: channel.id,
      title: channel.title ?? channel.id,
      channelUrl: buildChannelUrl(channel),
      customUrl: channel.custom_url ?? undefined,
      thumbnailUrl: channel.thumbnail_url ?? undefined,
      subscriberCount: row.subscriber_count ?? undefined,
      viewCount: row.view_count ?? undefined,
      videoCount: row.video_count ?? undefined,
    });
  }

  return items;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  let minSubscribers = 0;
  let maxSubscribers = MAX_ALLOWED_SUBSCRIBERS;

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
    const items = await fetchChannelsFromSupabase(supabase, minSubscribers, maxSubscribers);
    const filtered = items.filter((item) => !item.title?.includes("切り抜き"));
    return NextResponse.json({ items: filtered, total: filtered.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load channels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

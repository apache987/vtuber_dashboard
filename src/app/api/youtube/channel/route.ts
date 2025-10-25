// src/app/api/youtube/channel/route.ts
import { NextResponse } from "next/server";

// レスポンスの型（必要十分な最小項目）
type Channel = {
  id: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
  country?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
};

const KEYWORD = "Vtuber";
const MAX_RESULTS = 100;
const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const CHUNK_SIZE = 50; // YouTube Data API 上限
const COUNTRY_CODE = "JP";
const MAX_ALLOWED_SUBSCRIBERS = 10_000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Server is not configured with YOUTUBE_API_KEY" },
      { status: 500 }
    );
  }

  const parseBound = (name: string, fallback: number) => {
    const value = searchParams.get(name);
    if (value === null || value.trim() === "") return fallback;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new Error(`Invalid query parameter: ${name}`);
    }
    return Math.floor(num);
  };

  let minSubscribers = 0;
  let maxSubscribers = MAX_ALLOWED_SUBSCRIBERS;
  try {
    minSubscribers = parseBound("minSubscribers", 0);
    maxSubscribers = parseBound("maxSubscribers", MAX_ALLOWED_SUBSCRIBERS);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid query parameter";
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

  const collected: Channel[] = [];
  const seen = new Set<string>();
  let nextPageToken: string | undefined;

  while (collected.length < MAX_RESULTS) {
    const remaining = MAX_RESULTS - collected.length;
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set("part", "id");
    url.searchParams.set("q", KEYWORD);
    url.searchParams.set("type", "channel");
    url.searchParams.set("maxResults", Math.min(CHUNK_SIZE, remaining).toString());
    url.searchParams.set("key", key);
    url.searchParams.set("regionCode", COUNTRY_CODE);
    url.searchParams.set("relevanceLanguage", "ja");
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);

    const searchRes = await fetch(url.toString(), { method: "GET" });
    if (!searchRes.ok) {
      const text = await searchRes.text();
      return NextResponse.json(
        { error: `YouTube search API error: ${searchRes.status}`, detail: text },
        { status: 502 }
      );
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
      if (!searchData.nextPageToken) break;
      nextPageToken = searchData.nextPageToken;
      continue;
    }

    const detailUrl = new URL(CHANNELS_ENDPOINT);
    detailUrl.searchParams.set("part", "snippet,statistics");
    detailUrl.searchParams.set("id", candidateIds.join(","));
    detailUrl.searchParams.set("key", key);

    const detailRes = await fetch(detailUrl.toString(), { method: "GET" });
    if (!detailRes.ok) {
      const text = await detailRes.text();
      return NextResponse.json(
        { error: `YouTube channels API error: ${detailRes.status}`, detail: text },
        { status: 502 }
      );
    }

    const detailData = await detailRes.json();
    const detailMap = new Map<string, Channel>();
    for (const it of detailData.items ?? []) {
      const channel: Channel = {
        id: it.id,
        title: it.snippet?.title,
        customUrl: it.snippet?.customUrl,
        thumbnailUrl: it.snippet?.thumbnails?.default?.url,
        country: it.snippet?.country,
        subscriberCount: it.statistics?.hiddenSubscriberCount ? undefined : Number(it.statistics?.subscriberCount ?? 0),
        viewCount: Number(it.statistics?.viewCount ?? 0),
        videoCount: Number(it.statistics?.videoCount ?? 0),
      };
      detailMap.set(channel.id, channel);
    }

    for (const id of candidateIds) {
      const channel = detailMap.get(id);
      if (channel) collected.push(channel);
    }

    nextPageToken = searchData.nextPageToken;
    if (!nextPageToken) break;
  }

  const filtered = collected.filter((channel) => {
    if (channel.country !== COUNTRY_CODE) return false;
    if (typeof channel.subscriberCount !== "number") return false;
    return channel.subscriberCount >= minSubscribers && channel.subscriberCount <= maxSubscribers;
  });

  return NextResponse.json({ items: filtered.slice(0, MAX_RESULTS) });
}

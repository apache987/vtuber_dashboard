"use client";

import { log } from "console";
import { useCallback, useEffect, useState } from "react";

type Channel = {
  id: string;
  title: string;
  channelUrl?: string;
  customUrl?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
};

type ChannelApiResponse = {
  items?: Channel[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
};

const MAX_ALLOWED_SUBSCRIBERS = 10_000;
const DEFAULT_MIN_SUBSCRIBERS = 0;
const PAGE_SIZE = 30;

const getChannelUrl = (channel: Channel) => {
  if (channel.channelUrl) return channel.channelUrl;
  const customUrl = channel.customUrl;
  if (typeof customUrl === "string" && customUrl.length > 0) {
    if (/^https?:\/\//i.test(customUrl)) return customUrl;
    if (customUrl.startsWith("@")) return `https://www.youtube.com/${customUrl}`;
    return `https://www.youtube.com/c/${customUrl}`;
  }
  if (channel.id) {
    return `https://www.youtube.com/channel/${channel.id}`;
  }
  return undefined;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [minSubscribers, setMinSubscribers] = useState(DEFAULT_MIN_SUBSCRIBERS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [draftMin, setDraftMin] = useState<string>(String(DEFAULT_MIN_SUBSCRIBERS));
  const [dialogError, setDialogError] = useState<string | null>(null);

  const applyResponse = useCallback((json: ChannelApiResponse | undefined, requestedPage: number) => {
    const items: Channel[] = Array.isArray(json?.items) ? json.items : [];
    const nextTotal =
      typeof json?.total === "number" && Number.isFinite(json.total) ? Number(json.total) : items.length;
    const remotePage =
      typeof json?.page === "number" && Number.isFinite(json.page) && json.page > 0 ? Math.floor(json.page) : requestedPage;
    const maxPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
    const normalizedPage = Math.min(maxPage, Math.max(1, remotePage));

    setData(items);
    setTotal(nextTotal);
    setPage((current) => (current === normalizedPage ? current : normalizedPage));
  }, []);

  const fetchChannels = useCallback(
    async (min: number, pageNumber: number) => {
      setLoading(true);
      setError(null);
      setData([]);
      try {
        const params = new URLSearchParams();
        params.set("minSubscribers", String(min));
        params.set("maxSubscribers", String(MAX_ALLOWED_SUBSCRIBERS));
        params.set("page", String(pageNumber));
        const res = await fetch(`/api/youtube/channel?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to fetch data");
        applyResponse(json, pageNumber);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [applyResponse]
  );

  const refreshChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("minSubscribers", String(minSubscribers));
      params.set("maxSubscribers", String(MAX_ALLOWED_SUBSCRIBERS));
      params.set("page", String(page));
      const res = await fetch(`/api/youtube/channel?${params.toString()}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to refresh data");
      applyResponse(json, page);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [applyResponse, minSubscribers, page]);

  useEffect(() => {
    void fetchChannels(minSubscribers, page);
  }, [fetchChannels, minSubscribers, page]);

  const openFilterDialog = () => {
    setDraftMin(String(minSubscribers));
    setDialogError(null);
    setIsDialogOpen(true);
  };

  const closeFilterDialog = () => {
    setIsDialogOpen(false);
    setDialogError(null);
  };

  const applyFilter = () => {
    const parsedMin = Number(draftMin);
    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      setDialogError("下限は0以上の数値を入力してください。");
      return;
    }
    if (parsedMin > MAX_ALLOWED_SUBSCRIBERS) {
      setDialogError(`下限は${MAX_ALLOWED_SUBSCRIBERS.toLocaleString()}人以下になるように設定してください。`);
      return;
    }

    setMinSubscribers(Math.floor(parsedMin));
    setPage(1);
    setIsDialogOpen(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;
  const displayedCount = data.length;

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
      <h1>Supabase チャンネル一覧</h1>
      <p>
        Supabaseの<code>channels</code>と<code>channel_stats</code>からチャンネル名・登録者数・URL・サムネイルを取得しています。
      </p>
      <p style={{ marginTop: 8, color: "#333" }}>
        表示条件: 登録者数 {minSubscribers.toLocaleString()}人 〜 {MAX_ALLOWED_SUBSCRIBERS.toLocaleString()}人
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={refreshChannels} disabled={loading} style={{ padding: "10px 16px" }}>
          {loading ? "取得中..." : "最新のデータを取得"}
        </button>
        <button type="button" onClick={openFilterDialog} style={{ padding: "10px 16px" }}>
          登録者数フィルターを変更
        </button>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 16 }}>
          エラー: {error}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <h2>チャンネル一覧</h2>
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            overflow: "hidden",
            maxHeight: 520,
          }}
        >
          <div style={{ overflowY: "auto", maxHeight: 520 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead
                style={{
                  position: "sticky",
                  top: 0,
                  background: "#fff",
                  color: "#000",
                  zIndex: 1,
                }}
              >
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>チャンネル名</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8, width: 160 }}>サムネイル</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8, width: 90 }}>登録者数</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>チャンネルURL</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 16, textAlign: "center", color: "#555" }}>
                      該当するチャンネルがありません。
                    </td>
                  </tr>
                ) : (
                  data.map((channel) => {
                    const url = getChannelUrl(channel);
                    return (
                      <tr key={channel.id}>
                        <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                          {channel.title}
                          {channel.customUrl ? (
                            <>
                              <br />
                              <small style={{ color: "#555" }}>{channel.customUrl}</small>
                            </>
                          ) : null}
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                          {channel.thumbnailUrl ? (
                            <img src={channel.thumbnailUrl} alt={channel.title} width={60} height={60} />
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 8 }}>
                          {channel.subscriberCount?.toLocaleString?.() ?? "-"}
                        </td>
                        <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {url}
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
          <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={isFirstPage || loading} style={{ padding: "8px 14px" }}>
            前のページ
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={isLastPage || loading}
            style={{ padding: "8px 14px" }}
          >
            次のページ
          </button>
        </div>
        <p style={{ textAlign: "right", color: "#555" }}>
          ページ {page} / {totalPages}（表示 {displayedCount.toLocaleString()} 件 / 全 {total.toLocaleString()} 件）
        </p>
      </div>

      {isDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 24,
              width: "min(90%, 360px)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>登録者数フィルター</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", fontSize: 14, color: "#333" }}>
                下限（人）
                <input
                  type="number"
                  min={0}
                  value={draftMin}
                  onChange={(e) => {
                    setDraftMin(e.target.value);
                    setDialogError(null);
                  }}
                  style={{ marginTop: 4, padding: 8, fontSize: 16 }}
                />
              </label>
              <p style={{ fontSize: 14, color: "#333", margin: 0 }}>
                上限（人）: {MAX_ALLOWED_SUBSCRIBERS.toLocaleString()}（固定）
              </p>
              {dialogError && <p style={{ color: "crimson", margin: "4px 0 0" }}>{dialogError}</p>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              <button
                type="button"
                onClick={closeFilterDialog}
                style={{ padding: "8px 14px", background: "#000", color: "#fff", border: "none", borderRadius: 4 }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={applyFilter}
                style={{ padding: "8px 14px", background: "#000", color: "#fff", border: "none", borderRadius: 4 }}
              >
                適用
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

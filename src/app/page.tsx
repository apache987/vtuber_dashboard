"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type ChannelApiResponse = {
  items?: Channel[];
  total?: number;
  error?: string;
};

const MAX_ALLOWED_SUBSCRIBERS = 10_000;
const DEFAULT_MIN_SUBSCRIBERS = 0;
const DEFAULT_PAGE_SIZE = 30;
const PAGE_SIZE_OPTIONS = [12, 30, 60, 90];

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

type ViewMode = "table" | "grid";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<Channel[]>([]);

  const [minSubscribers, setMinSubscribers] = useState(DEFAULT_MIN_SUBSCRIBERS);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [draftMin, setDraftMin] = useState<string>(String(DEFAULT_MIN_SUBSCRIBERS));
  const [dialogError, setDialogError] = useState<string | null>(null);
  const fetchChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube/channel");
      const json: ChannelApiResponse = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch data");
      const items = Array.isArray(json?.items) ? json.items : [];
      setAllItems(items);
      setPage(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube/channel", { method: "POST" });
      const json: ChannelApiResponse & { refreshed?: number } = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to refresh data");
      const items = Array.isArray(json?.items) ? json.items : [];
      setAllItems(items);
      setPage(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (typeof item.subscriberCount !== "number") return true;
      return item.subscriberCount >= minSubscribers && item.subscriberCount <= MAX_ALLOWED_SUBSCRIBERS;
    });
  }, [allItems, minSubscribers]);

  useEffect(() => {
    setPage(1);
  }, [minSubscribers, pageSize]);

  const totalFiltered = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const displayedCount = pagedItems.length;

  const scrollToTop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

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
    setIsDialogOpen(false);
  };

  const handlePrevPage = () => {
    setPage((prev) => {
      const nextPage = Math.max(1, prev - 1);
      if (nextPage !== prev) scrollToTop();
      return nextPage;
    });
  };

  const handleNextPage = () => {
    setPage((prev) => {
      const nextPage = Math.min(totalPages, prev + 1);
      if (nextPage !== prev) scrollToTop();
      return nextPage;
    });
  };

  const handlePageSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value) && value > 0) {
      setPageSize(Math.floor(value));
    }
  };

  const renderTable = () => (
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
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8, width: 100 }}>登録者数</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>チャンネルURL</th>
            </tr>
          </thead>
          <tbody>
            {pagedItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} style={{ padding: 16, textAlign: "center", color: "#555" }}>
                  該当するチャンネルがありません。
                </td>
              </tr>
            ) : (
              pagedItems.map((channel) => {
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
  );

  const renderGrid = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 16,
        padding: 8,
      }}
    >
      {pagedItems.length === 0 && !loading ? (
        <p style={{ gridColumn: "1 / -1", textAlign: "center", color: "#555" }}>該当するチャンネルがありません。</p>
      ) : (
        pagedItems.map((channel) => {
          const url = getChannelUrl(channel);
          return (
            <div
              key={channel.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 8,
              }}
            >
              {channel.thumbnailUrl ? (
                <img src={channel.thumbnailUrl} alt={channel.title} width={120} height={120} style={{ objectFit: "cover", borderRadius: 8 }} />
              ) : (
                <div
                  style={{
                    width: 120,
                    height: 120,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#f3f3f3",
                    color: "#999",
                    borderRadius: 8,
                  }}
                >
                  No Image
                </div>
              )}
              <div>
                <strong>{channel.title}</strong>
              </div>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#0070f3" }}>
                  {url}
                </a>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
      <h1>Supabase チャンネル一覧</h1>
      <p>
        Supabaseの<code>channels</code>と<code>channel_stats</code>からチャンネル名・登録者数・URL・サムネイルを取得しています。
      </p>
      <p style={{ marginTop: 8, color: "#333" }}>
        表示条件: 登録者数 {minSubscribers.toLocaleString()}人 〜 {MAX_ALLOWED_SUBSCRIBERS.toLocaleString()}人
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16, alignItems: "center" }}>
        <button type="button" onClick={refreshChannels} disabled={loading} style={{ padding: "10px 16px" }}>
          {loading ? "取得中..." : "最新のデータを取得"}
        </button>
        <button type="button" onClick={openFilterDialog} style={{ padding: "10px 16px" }}>
          登録者数フィルターを変更
        </button>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          表示形式:
          <select
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as ViewMode)}
            style={{ padding: "6px 10px" }}
          >
            <option value="table">テーブル</option>
            <option value="grid">グリッド</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          1ページに表示する件数:
          <select value={pageSize} onChange={handlePageSizeChange} style={{ padding: "6px 10px" }}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 16 }}>
          エラー: {error}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <h2>チャンネル一覧</h2>
        {viewMode === "table" ? renderTable() : renderGrid()}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" onClick={handlePrevPage} disabled={page <= 1 || loading} style={{ padding: "8px 14px" }}>
              前のページ
            </button>
            <button type="button" onClick={handleNextPage} disabled={page >= totalPages || loading} style={{ padding: "8px 14px" }}>
              次のページ
            </button>
          </div>
          <p style={{ textAlign: "right", color: "#555", margin: 0 }}>
            ページ {page} / {totalPages}（表示 {displayedCount.toLocaleString()} 件 / フィルター後 {totalFiltered.toLocaleString()} 件 / 全 {allItems.length.toLocaleString()} 件）
          </p>
        </div>
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
                  onChange={(event) => {
                    setDraftMin(event.target.value);
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

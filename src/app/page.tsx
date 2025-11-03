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
    <section
      aria-label="チャンネル一覧（テーブル）"
      style={{
        marginTop: 24,
        background: "linear-gradient(180deg, #161b26, #121722)",
        border: "1px solid #2a3242",
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 18px 42px rgba(8, 12, 19, 0.35)",
        color: "#e9edf4",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            minWidth: 680,
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: "linear-gradient(0deg, #121722, #151b25)",
                  color: "#a8b0bf",
                  fontWeight: 700,
                  textAlign: "left",
                  fontSize: 12,
                  letterSpacing: 0.4,
                  padding: "16px 20px",
                  borderBottom: "1px solid #313a4e",
                }}
              >
                チャンネル
              </th>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: "linear-gradient(0deg, #121722, #151b25)",
                  color: "#a8b0bf",
                  fontWeight: 700,
                  textAlign: "right",
                  fontSize: 12,
                  letterSpacing: 0.4,
                  padding: "16px 20px",
                  borderBottom: "1px solid #313a4e",
                  width: 160,
                }}
              >
                登録者数
              </th>
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: "linear-gradient(0deg, #121722, #151b25)",
                  color: "#a8b0bf",
                  fontWeight: 700,
                  textAlign: "left",
                  fontSize: 12,
                  letterSpacing: 0.4,
                  padding: "16px 20px",
                  borderBottom: "1px solid #313a4e",
                  width: 220,
                }}
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {pagedItems.length === 0 && !loading ? (
              <tr>
                <td
                  colSpan={3}
                  style={{
                    padding: "24px 20px",
                    textAlign: "center",
                    color: "#a8b0bf",
                    borderBottom: "1px solid #233047",
                  }}
                >
                  該当するチャンネルがありません。
                </td>
              </tr>
            ) : (
              pagedItems.map((channel) => {
                const url = getChannelUrl(channel);
                const subscriberCount =
                  typeof channel.subscriberCount === "number" ? channel.subscriberCount.toLocaleString() : "不明";
                return (
                  <tr
                    key={channel.id}
                    style={{
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = "#141a26";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td
                      data-label="チャンネル"
                      style={{
                        padding: "18px 20px",
                        borderBottom: "1px solid #233047",
                        verticalAlign: "middle",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                        }}
                      >
                        <div
                          aria-hidden="true"
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: "50%",
                            border: "4px solid #0f141f",
                            background: channel.thumbnailUrl
                              ? "#0f141f"
                              : "radial-gradient(circle at 30% 20%, #ffd1e6, #b0c7ff)",
                            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.25)",
                            overflow: "hidden",
                            flex: "0 0 auto",
                          }}
                        >
                          {channel.thumbnailUrl ? (
                            <img
                              src={channel.thumbnailUrl}
                              alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "grid",
                                placeItems: "center",
                                fontSize: 26,
                              }}
                            >
                              🥚
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{channel.title}</span>
                          {channel.customUrl ? (
                            <span style={{ color: "#a8b0bf", fontSize: 12 }}>{channel.customUrl}</span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td
                      data-label="登録者数"
                      style={{
                        padding: "18px 20px",
                        borderBottom: "1px solid #233047",
                        textAlign: "right",
                        color: "#dbe6ff",
                        fontWeight: 600,
                        verticalAlign: "middle",
                      }}
                    >
                      {subscriberCount === "不明" ? "不明" : `${subscriberCount}人`}
                    </td>
                    <td
                      data-label="操作"
                      style={{
                        padding: "18px 20px",
                        borderBottom: "1px solid #233047",
                        verticalAlign: "middle",
                      }}
                    >
                      {url ? (
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "8px 14px",
                              background: "#4ca6ff",
                              color: "#071625",
                              fontWeight: 700,
                              borderRadius: 10,
                              textDecoration: "none",
                              fontSize: 13,
                              boxShadow: "0 10px 26px rgba(76, 166, 255, 0.25)",
                              transition: "filter 0.18s ease",
                            }}
                            onMouseEnter={(event) => {
                              event.currentTarget.style.filter = "brightness(1.05)";
                            }}
                            onMouseLeave={(event) => {
                              event.currentTarget.style.filter = "brightness(1)";
                            }}
                          >
                            チャンネルを開く
                          </a>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "8px 12px",
                              borderRadius: 10,
                              border: "1px solid #2a3242",
                              color: "#a8b0bf",
                              fontSize: 12,
                              background: "#1f2635",
                            }}
                          >
                            {url.replace(/^https?:\/\//, "")}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "#a8b0bf", fontSize: 12 }}>チャンネルURLが登録されていません</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderGrid = () => (
    <section
      aria-label="チャンネル一覧（グリッド）"
      style={{
        marginTop: 24,
        background: "radial-gradient(1200px 800px at 70% -10%, #1b2130 0, #0f1217 55%)",
        padding: "36px 24px",
        borderRadius: 24,
        border: "1px solid #1f2734",
        boxShadow: "0 22px 45px rgba(15, 18, 23, 0.32)",
        color: "#e9edf4",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 18,
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        }}
      >
        {pagedItems.length === 0 && !loading ? (
          <p style={{ gridColumn: "1 / -1", textAlign: "center", color: "#a8b0bf" }}>該当するチャンネルがありません。</p>
        ) : (
          pagedItems.map((channel) => {
            const url = getChannelUrl(channel);
            const subscriberCount =
              typeof channel.subscriberCount === "number" ? channel.subscriberCount.toLocaleString() : "不明";
            return (
              <article
                key={channel.id}
                style={{
                  position: "relative",
                  background: "linear-gradient(180deg, #161b26, #121722)",
                  border: "1px solid #2a3242",
                  borderRadius: 22,
                  padding: "96px 20px 20px",
                  overflow: "hidden",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
                  boxShadow: "0 2px 0 rgba(255, 255, 255, 0.02) inset",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
                onMouseEnter={(event) => {
                  const target = event.currentTarget;
                  target.style.transform = "translateY(-4px)";
                  target.style.borderColor = "#3a465e";
                  target.style.boxShadow = "0 16px 46px rgba(0, 0, 0, 0.42)";
                }}
                onMouseLeave={(event) => {
                  const target = event.currentTarget;
                  target.style.transform = "translateY(0)";
                  target.style.borderColor = "#2a3242";
                  target.style.boxShadow = "0 2px 0 rgba(255, 255, 255, 0.02) inset";
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 24,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 104,
                    height: 104,
                    borderRadius: "50%",
                    border: "8px solid #101520",
                    background: channel.thumbnailUrl
                      ? "#101520"
                      : "radial-gradient(circle at 30% 20%, #ffd1e6, #b0c7ff)",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    boxShadow: "0 12px 30px rgba(0, 0, 0, 0.38)",
                  }}
                >
                  {channel.thumbnailUrl ? (
                    <img
                      src={channel.thumbnailUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 32 }}>🥚</span>
                  )}
                </div>

                <div style={{ marginTop: 64, fontWeight: 700, fontSize: 16, textAlign: "center" }}>{channel.title}</div>
                <div style={{ color: "#a8b0bf", fontSize: 13, textAlign: "center" }}>登録者数 {subscriberCount}人</div>

                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      marginTop: "auto",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px 14px",
                      background: "#4ca6ff",
                      color: "#071625",
                      fontWeight: 700,
                      borderRadius: 12,
                      textDecoration: "none",
                      fontSize: 14,
                      boxShadow: "0 12px 32px rgba(76, 166, 255, 0.28)",
                      transition: "filter 0.18s ease",
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.filter = "brightness(1.05)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.filter = "brightness(1)";
                    }}
                  >
                    チャンネルを見る
                  </a>
                ) : (
                  <span style={{ color: "#a8b0bf", fontSize: 12 }}>チャンネルURLが登録されていません</span>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
      <header
        style={{
          borderRadius: 12,
          background: "linear-gradient(135deg, #fce570, #f7a7ff)",
          padding: "24px 28px",
          color: "#2d1263",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase", color: "#4a2d83" }}>VTuber Discovery</span>
        <h1 style={{ fontSize: 36, margin: 0, fontWeight: 800 }}>推しのたまご</h1>
        <p style={{ margin: 0, fontSize: 16, color: "#4b2f85" }}>
          新人・中堅VTuberのチャンネルを探してお気に入りの推しを見つけよう。
        </p>
      </header>

      <p style={{ marginTop: 8, color: "#333" }}>
        表示条件: 登録者数 {minSubscribers.toLocaleString()}人 〜 {MAX_ALLOWED_SUBSCRIBERS.toLocaleString()}人
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16, alignItems: "center" }}>
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

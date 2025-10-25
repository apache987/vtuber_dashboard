"use client";

import { useCallback, useEffect, useState } from "react";

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

const MAX_ALLOWED_SUBSCRIBERS = 10_000;
const DEFAULT_MIN_SUBSCRIBERS = 0;
const DEFAULT_MAX_SUBSCRIBERS = MAX_ALLOWED_SUBSCRIBERS;

const getChannelUrl = (channel: Channel) => {
  const customUrl = channel.customUrl;
  if (typeof customUrl === "string" && customUrl.length > 0) {
    return `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : `c/${customUrl}`}`;
  }
  return `https://www.youtube.com/channel/${channel.id}`;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minSubscribers, setMinSubscribers] = useState(DEFAULT_MIN_SUBSCRIBERS);
  const maxSubscribers = DEFAULT_MAX_SUBSCRIBERS;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [draftMin, setDraftMin] = useState<string>(String(DEFAULT_MIN_SUBSCRIBERS));
  const [dialogError, setDialogError] = useState<string | null>(null);

  const fetchChannels = useCallback(async (min: number, max: number) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = new URLSearchParams();
      params.set("minSubscribers", String(min));
      params.set("maxSubscribers", String(max));
      const res = await fetch(`/api/youtube/channel?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to fetch");
      setData(Array.isArray(json.items) ? json.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 初期表示および閾値変更時に最新の検索結果を取得
    void fetchChannels(minSubscribers, maxSubscribers);
  }, [fetchChannels, minSubscribers, maxSubscribers]);

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
    if (parsedMin > maxSubscribers) {
      setDialogError(`下限は${maxSubscribers.toLocaleString()}人以下になるように設定してください。`);
      return;
    }

    setMinSubscribers(Math.floor(parsedMin));
    setIsDialogOpen(false);
  };

  return (
    <main style={{ maxWidth: 840, margin: "40px auto", padding: 16 }}>
      <h1>YouTube チャンネル取得デモ</h1>
      <p>
        キーワード「Vtuber」で日本のYouTubeチャンネルを最大100件取得し、登録者数の範囲で絞り込み表示します。
      </p>
      <p style={{ marginTop: 8, color: "#333" }}>
        現在の絞り込み: {minSubscribers.toLocaleString()}人 〜 {maxSubscribers.toLocaleString()}人
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => {
            void fetchChannels(minSubscribers, maxSubscribers);
          }}
          disabled={loading}
          style={{ padding: "10px 16px" }}
        >
          {loading ? "取得中..." : "最新の検索結果を取得"}
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

      {data && (
        <div style={{ marginTop: 24 }}>
          <h2>結果</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>URL</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>タイトル</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>サムネ</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>登録者</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>総再生数</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>動画数</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => {
                const channelUrl = getChannelUrl(c);
                return (
                  <tr key={c.id}>
                    <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                      <a href={channelUrl} target="_blank" rel="noopener noreferrer">
                        {channelUrl}
                      </a>
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                      {c.title}
                      {c.customUrl ? (
                        <>
                          <br />
                          <small style={{ color: "#555" }}>@{c.customUrl.replace(/^@/, "")}</small>
                        </>
                      ) : null}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                      {c.thumbnailUrl ? (
                        <img src={c.thumbnailUrl} alt={c.title} width={60} height={60} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 8 }}>
                      {c.subscriberCount?.toLocaleString?.() ?? "-"}
                    </td>
                    <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 8 }}>
                      {c.viewCount?.toLocaleString?.() ?? "-"}
                    </td>
                    <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 8 }}>
                      {c.videoCount?.toLocaleString?.() ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
                上限（人）: {maxSubscribers.toLocaleString()}（固定）
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

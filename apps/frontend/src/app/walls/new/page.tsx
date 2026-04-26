import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "カベを追加 | Street Art App",
  description: "Street Art App の壁登録方法を選択",
};

type NewWallPageProps = {
  searchParams: Promise<{
    reason?: string | string[];
  }>;
};

const selectionMessages = {
  "scan-resolution-insufficient": {
    title: "カメラの解像度が足りません",
    description: "スキャンを開始できないため、登録方法の選択画面に戻しました。",
  },
} as const;

export default async function NewWallPage({ searchParams }: NewWallPageProps) {
  const { reason } = await searchParams;
  const normalizedReason = Array.isArray(reason) ? reason[0] : reason;
  const selectionMessage =
    normalizedReason && normalizedReason in selectionMessages
      ? selectionMessages[
          normalizedReason as keyof typeof selectionMessages
        ]
      : null;

  return (
    <main className="page-shell page-shell--new-wall-entry">
      <section className="new-wall-entry section-card" aria-labelledby="new-wall-entry-title">
        <div className="section-topline">
          <div className="stack-sm">
            <h1 className="section-title text-2xl font-bold" id="new-wall-entry-title">
              カベを追加
            </h1>
            <p className="section-copy">
              カメラで壁面をスキャンするか、手元の画像をアップロードして登録します。
            </p>
          </div>
        </div>

        {selectionMessage ? (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            <strong>{selectionMessage.title}</strong>
            <div>{selectionMessage.description}</div>
          </div>
        ) : null}

        <div className="registration-method-grid">
          <Link className="method-button" href="/walls/new/scan">
            <svg
              aria-hidden="true"
              className="method-button__icon"
              viewBox="0 0 24 24"
            >
              <path d="M4 7.5h3.1L8.7 5h6.6l1.6 2.5H20a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-1.6a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Z" />
            </svg>
            <span>
              <strong>スキャンで登録</strong>
              <small>カメラで壁を正面から手動撮影します。</small>
            </span>
          </Link>

          <Link className="method-button" href="/walls/new/upload">
            <svg
              aria-hidden="true"
              className="method-button__icon"
              viewBox="0 0 24 24"
            >
              <path d="M11 16.2V7.6l-3 3-1.4-1.4L12 3.8l5.4 5.4-1.4 1.4-3-3v8.6h-2ZM5 20.2a3 3 0 0 1-3-3v-2.4h2v2.4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2.4h2v2.4a3 3 0 0 1-3 3H5Z" />
            </svg>
            <span>
              <strong>画像をアップロードして登録</strong>
              <small>既存の画像補正フローを使います。</small>
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}

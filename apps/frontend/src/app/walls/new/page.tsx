import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "カベを追加 | ARsT",
  description: "ARsT の壁登録方法を選択",
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
      ? selectionMessages[normalizedReason as keyof typeof selectionMessages]
      : null;
  const methodButtonClassName =
    "flex min-h-32 items-center gap-4 rounded-[22px] border border-border bg-bg-elevated p-5 text-left no-underline transition hover:-translate-y-px hover:border-border-strong hover:bg-bg-muted focus-visible:-translate-y-px focus-visible:border-border-strong focus-visible:bg-bg-muted max-[720px]:min-h-[116px]";

  return (
    <main className="page-shell grid min-h-[calc(100dvh-var(--header-height))] content-start justify-items-center py-6 max-180:min-h-[calc(100dvh-var(--header-height)-var(--mobile-bottom-nav-space))] max-[720px]:py-[18px]">
      <section
        aria-labelledby="new-wall-entry-title"
        className="p-6 mx-4 w-full max-w-180 rounded-3xl max-[720px]:mx-2.5 max-[720px]:rounded-[20px]"
      >
        <div className="section-topline">
          <div className="stack-sm">
            <h1
              className="section-title text-2xl font-bold"
              id="new-wall-entry-title"
            >
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Link className={methodButtonClassName} href="/walls/new/scan">
            <svg
              aria-hidden="true"
              className="size-12 rounded-2xl bg-primary/12 p-3 fill-primary-active"
              viewBox="0 0 24 24"
            >
              <path d="M4 7.5h3.1L8.7 5h6.6l1.6 2.5H20a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-1.6a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Z" />
            </svg>
            <span className="grid gap-1.5">
              <strong className="text-lg">スキャンで登録</strong>
              <small className="text-sm leading-6 text-fg-muted">
                カメラで壁を正面から手動撮影します。
              </small>
            </span>
          </Link>

          <Link className={methodButtonClassName} href="/walls/new/upload">
            <svg
              aria-hidden="true"
              className="size-12 rounded-2xl bg-primary/12 p-3 fill-primary-active"
              viewBox="0 0 24 24"
            >
              <path d="M11 16.2V7.6l-3 3-1.4-1.4L12 3.8l5.4 5.4-1.4 1.4-3-3v8.6h-2ZM5 20.2a3 3 0 0 1-3-3v-2.4h2v2.4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2.4h2v2.4a3 3 0 0 1-3 3H5Z" />
            </svg>
            <span className="grid gap-1.5">
              <strong className="text-lg">画像をアップロードして登録</strong>
              <small className="text-sm leading-6 text-fg-muted">
                既存の画像補正フローを使います。
              </small>
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "キャンバスサイズガイド | Street Art App",
  description: "壁登録時に使うキャンバスサイズの目安",
};

const canvasExamples = [
  {
    size: "64 x 64",
    fit: "アイコンやサイン向け",
    note: "最小に近いサイズ。短時間で完成しやすいです。",
  },
  {
    size: "128 x 96",
    fit: "横長の文字入れ向け",
    note: "看板やシャッター風の構図に使いやすいバランスです。",
  },
  {
    size: "160 x 160",
    fit: "正方形の作品向け",
    note: "細部と編集負荷のバランスが取りやすい定番です。",
  },
  {
    size: "256 x 144",
    fit: "横長ポスター向け",
    note: "遠景でも見栄えしやすく、情報量も増やせます。",
  },
  {
    size: "320 x 240",
    fit: "複数人で描く中型作品向け",
    note: "共同編集の余白を確保しやすいサイズです。",
  },
  {
    size: "512 x 288",
    fit: "上限近い大作向け",
    note: "情報量は高いですが、制作時間と同期負荷も上がります。",
  },
];

export default function CanvasSizeGuidePage() {
  return (
    <main className="page-shell">
      <div className="page-header">
        <div className="stack-sm">
          <div className="page-kicker">Canvas Guide</div>
          <h1
            className="section-title"
            style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
          >
            キャンバスサイズの目安
          </h1>
          <p className="section-copy" style={{ maxWidth: 760 }}>
            長辺スライダーで決めた値に、選択した壁面の比率を掛けて最終サイズが決まります。ここでは
            代表的なサイズ感をまとめています。
          </p>
        </div>
        <Link className="button button-secondary" href="/walls/new">
          登録画面へ戻る
        </Link>
      </div>

      <section className="section-card">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {canvasExamples.map((example) => (
            <article className="wall-card" key={example.size}>
              <div className="grid min-h-50 place-items-center bg-bg-muted/45 p-6">
                <div
                  className="grid w-full max-w-55 place-items-center rounded-2xl border border-border bg-bg-elevated px-6 py-4 text-center text-lg font-bold shadow-[var(--shadow-elevated)]"
                  style={{ aspectRatio: example.size.replace(" x ", " / ") }}
                >
                  {example.size}
                </div>
              </div>
              <div className="wall-card__body">
                <div style={{ fontWeight: 700, fontSize: "1.08rem" }}>
                  {example.fit}
                </div>
                <div className="muted-copy">{example.note}</div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

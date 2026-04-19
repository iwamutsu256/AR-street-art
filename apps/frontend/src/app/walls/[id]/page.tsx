import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getWall } from '../../../lib/api';

type WallDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({ params }: WallDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const wall = await getWall(id);

  return {
    title: wall ? `${wall.name} | Street Art App` : 'Wall Detail | Street Art App',
    description: wall ? `${wall.name} のキャンバス詳細` : 'Street Art App の壁詳細',
  };
}

export default async function WallDetailPage({ params }: WallDetailPageProps) {
  const { id } = await params;
  const wall = await getWall(id);

  if (!wall) {
    notFound();
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <div className="stack-sm">
          <div className="page-kicker">Wall Detail</div>
          <h1 className="section-title" style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}>
            {wall.name}
          </h1>
          <p className="section-copy" style={{ maxWidth: 780 }}>
            壁画像とキャンバスの基本情報を確認し、そのままリアルタイム編集画面へ入れます。
          </p>
        </div>

        <div className="inline-actions">
          <Link className="button button-secondary" href="/">
            一覧へ戻る
          </Link>
          {wall.rectifiedImageUrl ? (
            <Link className="button button-secondary" href={`/ar/${wall.id}`}>
              AR で見る
            </Link>
          ) : null}
          {wall.canvas ? (
            <Link className="button button-primary" href={`/canvases/${wall.canvas.id}`}>
              壁に書き込む
            </Link>
          ) : null}
        </div>
      </div>

      <section className="section-card wall-detail-grid">
        <div className="stack-sm">
          <div className="step-badge">Preview</div>
          <div className="wall-detail-image">
            {wall.rectifiedImageUrl || wall.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={wall.name}
                src={wall.rectifiedImageUrl ?? wall.photoUrl ?? ''}
              />
            ) : (
              <div className="empty-state">画像がまだありません。</div>
            )}
          </div>
        </div>

        <div className="stack-md">
          <div className="stack-sm">
            <div className="step-badge">Canvas</div>
            <h2 className="section-title" style={{ fontSize: '1.3rem' }}>
              編集キャンバス
            </h2>
          </div>

          {wall.canvas ? (
            <div className="info-grid">
              <div className="info-card">
                <div className="muted-copy">Canvas ID</div>
                <div className="mono">{wall.canvas.id}</div>
              </div>
              <div className="info-card">
                <div className="muted-copy">サイズ</div>
                <div>
                  {wall.canvas.width} x {wall.canvas.height}px
                </div>
              </div>
              <div className="info-card">
                <div className="muted-copy">パレット</div>
                <div>{wall.canvas.paletteVersion}</div>
              </div>
            </div>
          ) : (
            <div className="notice">この壁にはまだキャンバスがありません。</div>
          )}

          <div className="info-grid">
            <div className="info-card">
              <div className="muted-copy">緯度経度</div>
              <div>
                {wall.latitude}, {wall.longitude}
              </div>
            </div>
            <div className="info-card">
              <div className="muted-copy">表示半径</div>
              <div>{wall.visibilityRadiusM}m</div>
            </div>
            <div className="info-card">
              <div className="muted-copy">方角</div>
              <div>{wall.approxHeading ?? '未設定'}</div>
            </div>
          </div>

          <div className="notice">
            入口は 1 壁 1 キャンバス想定です。最新の仕様に合わせ、編集画面では API で全体スナップショットを取得してから
            WebSocket に接続します。
          </div>
        </div>
      </section>
    </main>
  );
}

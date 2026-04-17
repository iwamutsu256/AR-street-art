import Link from 'next/link';
import type { Metadata } from 'next';
import { NewWallForm } from '../../../components/walls/NewWallForm';

export const metadata: Metadata = {
  title: '新規壁登録 | Street Art App',
  description: 'Street Art App の壁登録フロー',
};

export default function NewWallPage() {
  return (
    <main className="page-shell">
      <div className="page-header">
        <div className="stack-sm">
          <div className="page-kicker">Wall Registration</div>
          <h1 className="section-title" style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)' }}>
            新しい壁を登録
          </h1>
          <p className="section-copy" style={{ maxWidth: 760 }}>
            画像の正規化はブラウザで行い、既存の <span className="mono">POST /api/walls</span> へ
            multipart 送信します。App Router のページはサーバー側に置き、操作の多い UI はクライアント
            コンポーネントに分離しています。
          </p>
        </div>

        <Link className="button button-secondary" href="/">
          一覧へ戻る
        </Link>
      </div>

      <NewWallForm mapTilerKey={process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''} />
    </main>
  );
}

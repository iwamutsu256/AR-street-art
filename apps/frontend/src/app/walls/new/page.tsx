import Link from 'next/link';
import type { Metadata } from 'next';
import { NewWallRegistrationForm } from '../../../components/walls/NewWallRegistrationForm';

export const metadata: Metadata = {
  title: '新規壁登録 | Street Art App',
  description: 'Street Art App の壁登録フロー',
};

export default function NewWallPage() {
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

  return (
    <main className="page-shell">
      <div className="page-header">
        <div className="stack-sm">
          <div className="page-kicker">Wall Registration</div>
          <h1 className="section-title" style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)' }}>
            新しい壁を登録
          </h1>
          <p className="section-copy" style={{ maxWidth: 760 }}>
            スキャン登録または画像アップロード登録を選び、範囲確認、画像補正、キャンバスサイズ、名称と位置を
            画面ごとに進めます。
          </p>
        </div>

        <Link className="button button-secondary" href="/">
          一覧へ戻る
        </Link>
      </div>

      <NewWallRegistrationForm mapTilerKey={mapTilerKey} />
    </main>
  );
}

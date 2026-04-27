'use client';

import Link from 'next/link';

export function MapPlaceholder() {
  return (
    <div
      className="grid min-h-80 place-items-center overflow-hidden rounded-3xl border border-border"
      style={{
        background:
          "radial-gradient(circle at top left, rgba(255, 227, 178, 0.42), transparent 30%), linear-gradient(135deg, var(--color-bg-elevated), rgba(239, 229, 212, 0.96))",
      }}
    >
      <div className="max-w-[360px] px-6 text-center">
        <div className="mb-2 text-xl font-bold">Wall Map</div>
        <div className="muted-copy mb-5">
          地図上で壁を探して、書き込みや AR 表示へ移動できます。
        </div>
        <Link className="button button-primary" href="/">
          マップを開く
        </Link>
      </div>
    </div>
  );
}

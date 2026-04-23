'use client';

import Link from 'next/link';

export function MapPlaceholder() {
  return (
    <div className="placeholder-map">
      <div className="placeholder-map__content">
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Wall Map</div>
        <div className="muted-copy" style={{ marginBottom: 18 }}>
          地図上で壁を探して、書き込みや AR 表示へ移動できます。
        </div>
        <Link className="button button-primary" href="/">
          マップを開く
        </Link>
      </div>
    </div>
  );
}

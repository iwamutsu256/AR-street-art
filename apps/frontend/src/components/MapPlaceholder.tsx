"use client";

import Link from "next/link";

export function MapPlaceholder() {
  return (
    <div className="grid min-h-80 place-items-center overflow-hidden rounded-3xl border border-border bg-bg-muted">
      <div className="max-w-90 px-6 text-center">
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

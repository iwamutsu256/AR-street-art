'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNearbyWalls } from '../hooks/useNearbyWalls';
import { getAppChromeSettings } from '../lib/appChrome';

export default function NearbyWallBanner() {
  const pathname = usePathname();
  const { nearbyWalls } = useNearbyWalls();
  const { showNearbyWallBanner } = getAppChromeSettings(pathname);

  if (pathname === '/') return null;
  if (!showNearbyWallBanner) return null;
  if (nearbyWalls.length === 0) return null;

  const wall = nearbyWalls[0];

  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-4 rounded-full border border-border bg-bg-elevated px-5 py-3.5 shadow-[var(--shadow-elevated)] backdrop-blur-md max-[720px]:bottom-[calc(var(--mobile-bottom-nav-space)+12px)] max-[720px]:w-[calc(100vw-20px)] max-[720px]:gap-2.5 max-[720px]:px-3 max-[720px]:py-2.5"
      role="alert"
    >
      <span className="text-sm font-medium max-[720px]:text-xs">
        📍 近くに壁があります:{' '}
        <strong>{wall.name}</strong>{' '}
        <span className="text-xs text-fg-muted">
          ({Math.round(wall.distanceM)}m)
        </span>
      </span>
      <Link
        className="button button-primary min-h-9 whitespace-nowrap px-3.5 text-sm"
        href={`/ar/${wall.id}`}
      >
        AR で見る
      </Link>
    </div>
  );
}

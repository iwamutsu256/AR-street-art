'use client';

import Link from 'next/link';
import { useNearbyWalls } from '../hooks/useNearbyWalls';

export default function NearbyWallBanner() {
  const { nearbyWalls } = useNearbyWalls();

  if (nearbyWalls.length === 0) return null;

  const wall = nearbyWalls[0];

  return (
    <div className="nearby-wall-banner" role="alert" aria-live="polite">
      <span style={{ fontSize: '0.95rem' }}>
        📍 近くに壁があります:{' '}
        <strong>{wall.name}</strong>{' '}
        <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>({Math.round(wall.distanceM)}m)</span>
      </span>
      <Link
        className="button button-primary"
        href={`/walls/${wall.id}/ar`}
        style={{ fontSize: '0.88rem', minHeight: 36, padding: '0 14px', whiteSpace: 'nowrap' }}
      >
        AR で見る
      </Link>
    </div>
  );
}

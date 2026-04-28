'use client';

import { useEffect, useRef, useState } from 'react';
import type { WallSummary } from '@street-art/shared';

const NEARBY_THRESHOLD_M = 30;

export type NearbyWall = WallSummary & { distanceM: number };

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useNearbyWalls() {
  const [nearbyWalls, setNearbyWalls] = useState<NearbyWall[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const wallsRef = useRef<WallSummary[]>([]);

  useEffect(() => {
    fetch('/api/walls')
      .then((r) => r.json())
      .then((walls: WallSummary[]) => { wallsRef.current = walls; })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const nearby = wallsRef.current
          .map((w) => ({ ...w, distanceM: distanceMeters(latitude, longitude, w.latitude, w.longitude) }))
          .filter((w) => w.distanceM <= NEARBY_THRESHOLD_M)
          .sort((a, b) => a.distanceM - b.distanceM);
        setNearbyWalls(nearby);
      },
      (err) => { if (err.code === err.PERMISSION_DENIED) setPermissionDenied(true); },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { nearbyWalls, permissionDenied };
}

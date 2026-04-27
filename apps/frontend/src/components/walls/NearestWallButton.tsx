'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPinArea } from '@phosphor-icons/react';

type NearestWall = {
  id: string;
  name: string;
  distance?: number;
};

function isGeolocationError(error: unknown): error is GeolocationPositionError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function getCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    });
  });
}

export function NearestWallButton() {
  const router = useRouter();
  const [isFinding, setIsFinding] = useState(false);
  const [status, setStatus] = useState('');

  async function handleFindNearestWall() {
    if (!navigator.geolocation) {
      setStatus('位置情報を利用できません。');
      return;
    }

    setIsFinding(true);
    setStatus('');

    try {
      const position = await getCurrentPosition();
      const params = new URLSearchParams({
        lat: String(position.coords.latitude),
        lon: String(position.coords.longitude),
      });
      const response = await fetch(`/api/walls/nearest?${params.toString()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('近くのカベを検索できませんでした。');
      }

      const wall = (await response.json()) as NearestWall | null;

      if (!wall) {
        setStatus('近くのカベが見つかりませんでした。');
        return;
      }

      router.push(`/walls/${wall.id}`);
    } catch (error) {
      if (isGeolocationError(error) && error.code === 1) {
        setStatus('位置情報の許可が必要です。');
        return;
      }

      setStatus(error instanceof Error ? error.message : '近くのカベを検索できませんでした。');
    } finally {
      setIsFinding(false);
    }
  }

  return (
    <div className="grid gap-1.5">
      <button
        className="grid min-h-[172px] place-items-center content-center gap-3 rounded-[20px] border border-[rgba(47,125,120,0.35)] bg-[linear-gradient(135deg,rgba(47,125,120,0.12),rgba(38,61,94,0.12)),rgba(255,255,255,0.82)] p-[18px] text-center font-black text-fg transition hover:-translate-y-px hover:border-[rgba(47,125,120,0.58)] hover:bg-[linear-gradient(135deg,rgba(47,125,120,0.18),rgba(38,61,94,0.16)),rgba(255,255,255,0.94)] focus-visible:-translate-y-px focus-visible:border-[rgba(47,125,120,0.58)] focus-visible:bg-[linear-gradient(135deg,rgba(47,125,120,0.18),rgba(38,61,94,0.16)),rgba(255,255,255,0.94)] disabled:cursor-progress disabled:opacity-70 max-[720px]:min-h-[clamp(124px,25dvh,170px)] max-[720px]:gap-2 max-[720px]:p-3.5"
        disabled={isFinding}
        onClick={handleFindNearestWall}
        type="button"
      >
        <MapPinArea
          aria-hidden="true"
          className="text-secondary"
          size={46}
          weight="duotone"
        />
        <span className="text-[1.12rem] leading-tight max-[720px]:text-base">
          {isFinding ? '検索中' : '近くのカベを探す'}
        </span>
      </button>
      <div
        aria-live="polite"
        className="min-h-[18px] text-center text-[0.82rem] font-bold text-fg-muted max-[720px]:min-h-4 max-[720px]:text-xs"
      >
        {status}
      </div>
    </div>
  );
}

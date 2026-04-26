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
    <div className="nearest-wall-action">
      <button
        className="nearest-wall-action__button"
        disabled={isFinding}
        onClick={handleFindNearestWall}
        type="button"
      >
        <MapPinArea aria-hidden="true" size={46} weight="duotone" />
        <span>{isFinding ? '検索中' : '近くのカベを探す'}</span>
      </button>
      <div className="nearest-wall-action__status" aria-live="polite">
        {status}
      </div>
    </div>
  );
}

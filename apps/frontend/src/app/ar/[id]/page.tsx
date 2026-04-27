'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  getPaletteIndexFromPixelValue,
  normalizePixelValue,
  type CanvasSnapshot,
  type WallDetail,
} from '@street-art/shared';
import { Spinner } from '../../../components/Spinner';

const ARScene = dynamic(() => import('../../../components/ar/ARScene'), { ssr: false });

function renderCanvasToDataUrl(snapshot: CanvasSnapshot): string {
  const canvas = document.createElement('canvas');
  canvas.width = snapshot.width;
  canvas.height = snapshot.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const imageData = ctx.createImageData(snapshot.width, snapshot.height);
  const bytes = Uint8Array.from(atob(snapshot.pixels), (c) => c.charCodeAt(0));
  for (let i = 0; i < bytes.length; i++) {
    const pixelValue = normalizePixelValue(bytes[i] ?? 0, snapshot.palette.length);
    const paletteIndex = getPaletteIndexFromPixelValue(pixelValue);
    const offset = i * 4;

    if (paletteIndex === null) {
      imageData.data[offset + 3] = 0;
      continue;
    }

    const hex = snapshot.palette[paletteIndex] ?? null;
    if (!hex) {
      imageData.data[offset + 3] = 0;
      continue;
    }

    imageData.data[offset] = parseInt(hex.slice(1, 3), 16);
    imageData.data[offset + 1] = parseInt(hex.slice(3, 5), 16);
    imageData.data[offset + 2] = parseInt(hex.slice(5, 7), 16);
    imageData.data[offset + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

type ARData = {
  rectifiedUrl: string;
  artworkUrl: string;
  aspectRatio: number;
};

export default function WallARPage() {
  const params = useParams();
  const router = useRouter();
  const wallId = params.id as string;

  const [arData, setArData] = useState<ARData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const wallRes = await fetch(`/api/walls/${wallId}`);
        if (!wallRes.ok) throw new Error('壁の取得に失敗しました');
        const wall: WallDetail = await wallRes.json();

        if (!wall.rectifiedImageUrl) throw new Error('この壁には rectified 画像がありません');

        const proxied = (url: string) =>
          url.startsWith('blob:') || url.startsWith('data:')
            ? url
            : `/api/proxy-image?url=${encodeURIComponent(url)}`;

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
          el.src = proxied(wall.rectifiedImageUrl!);
        });
        const aspectRatio = img.naturalWidth / img.naturalHeight;

        let artworkUrl: string;
        if (wall.canvas) {
          const snapRes = await fetch(`/api/canvases/${wall.canvas.id}`);
          if (snapRes.ok) {
            const snap: CanvasSnapshot = await snapRes.json();
            artworkUrl = renderCanvasToDataUrl(snap);
          } else {
            artworkUrl = wall.thumbnailImageUrl ?? wall.rectifiedImageUrl!;
          }
        } else {
          artworkUrl = wall.thumbnailImageUrl ?? wall.rectifiedImageUrl!;
        }

        setArData({ rectifiedUrl: wall.rectifiedImageUrl!, artworkUrl, aspectRatio });
      } catch (e) {
        setError((e as Error).message);
      }
    }

    load();
  }, [wallId]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-bg-inverse px-6 text-center">
        <p className="m-0 text-danger">{error}</p>
        <button
          onClick={() => router.push(`/walls/${wallId}`)}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-secondary px-6 text-secondary-fg"
        >
          壁の詳細へ戻る
        </button>
      </div>
    );
  }

  if (!arData) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-inverse">
        <div className="grid gap-3 text-center text-fg-inverse">
          <Spinner tone="inverse" />
          <p className="m-0 text-sm">AR を準備中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-bg-inverse">
      <div className="fixed top-4 left-4 z-[110]">
        <button
          onClick={() => { window.location.href = `/walls/${wallId}`; }}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/20 bg-[rgba(20,17,14,0.62)] px-4 text-sm text-fg-inverse backdrop-blur-sm"
        >
          ← 戻る
        </button>
      </div>
      <ARScene
        rectifiedUrl={arData.rectifiedUrl}
        artworkUrl={arData.artworkUrl}
        aspectRatio={arData.aspectRatio}
      />
    </div>
  );
}

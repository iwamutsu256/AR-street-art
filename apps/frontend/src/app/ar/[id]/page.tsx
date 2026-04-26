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
      <div style={{ background: 'var(--color-bg-inverse)', position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 100 }}>
        <p style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p>
        <button
          onClick={() => router.push(`/walls/${wallId}`)}
          style={{ padding: '10px 24px', background: 'var(--color-secondary)', color: 'var(--color-secondary-fg)', borderRadius: 8, border: 'none', cursor: 'pointer' }}
        >
          壁の詳細へ戻る
        </button>
      </div>
    );
  }

  if (!arData) {
    return (
      <div style={{ background: 'var(--color-bg-inverse)', position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ color: 'var(--color-fg-inverse)', textAlign: 'center', display: 'grid', gap: 12 }}>
          <div className="ar-spinner" style={{ borderColor: 'rgba(255, 248, 244, 0.3)', borderTopColor: 'var(--color-fg-inverse)', margin: '0 auto' }} />
          <p style={{ margin: 0, fontSize: 14 }}>AR を準備中...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-inverse)', overflow: 'hidden', zIndex: 100 }}>
      <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 110 }}>
        <button
          onClick={() => { window.location.href = `/walls/${wallId}`; }}
          style={{
            padding: '8px 16px',
            background: 'rgba(20, 17, 14, 0.62)',
            color: 'var(--color-fg-inverse)',
            borderRadius: 999,
            border: '1px solid rgba(255, 248, 244, 0.2)',
            fontSize: 14,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
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

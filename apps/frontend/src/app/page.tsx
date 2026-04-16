import { MapPlaceholder } from '../components/MapPlaceholder';
import type { WallSummary } from '@street-art/shared';

function getApiUrl(path: string) {
  const normalizedPath = `/${path.replace(/^\//, '')}`;
  const internalApiOrigin = process.env.API_PROXY_TARGET?.replace(/\/$/, '');

  if (internalApiOrigin) {
    return new URL(normalizedPath, `${internalApiOrigin}/`).toString();
  }

  const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  const apiBasePath = (process.env.NEXT_PUBLIC_API_BASE ?? '/api').replace(/\/$/, '');
  return new URL(`${apiBasePath}${normalizedPath}`, appOrigin).toString();
}

async function getHealth() {
  try {
    const res = await fetch(getApiUrl('/health'), { cache: 'no-store' });

    if (!res.ok) {
      return { ok: false, db: false, redis: false };
    }

    return res.json() as Promise<{ ok: boolean; db: boolean; redis: boolean }>;
  } catch {
    return { ok: false, db: false, redis: false };
  }
}

async function getWalls() {
  try {
    const res = await fetch(getApiUrl('/walls'), { cache: 'no-store' });

    if (!res.ok) {
      return [];
    }

    return (await res.json()) as WallSummary[];
  } catch {
    return [];
  }
}

export default async function Home() {
  const [health, walls] = await Promise.all([getHealth(), getWalls()]);

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Street Art App</h1>
      <p style={{ color: '#4b5563', marginBottom: 24 }}>
        Docker / Next.js / Hono / PostGIS / Redis の最小起動確認ページです。
      </p>

      <section style={{ marginBottom: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 16 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Health</h2>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(health, null, 2)}</pre>
      </section>

      <section style={{ marginBottom: 24 }}>
        <MapPlaceholder />
      </section>

      <section style={{ padding: 16, border: '1px solid #e5e7eb', borderRadius: 16 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Walls from API</h2>
        {walls.length === 0 ? (
          <p>壁データを取得できませんでした。</p>
        ) : (
          <ul style={{ display: 'grid', gap: 16, listStyle: 'none', padding: 0, margin: 0 }}>
            {walls.map((wall) => (
              <li key={wall.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{wall.name}</div>
                <div style={{ color: '#4b5563', marginBottom: 4 }}>ID: {wall.id}</div>
                <div style={{ color: '#4b5563', marginBottom: 8 }}>
                  緯度経度: {wall.latitude}, {wall.longitude}
                </div>
                {wall.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={wall.photoUrl}
                    alt={wall.name}
                    style={{ width: '100%', maxWidth: 420, borderRadius: 12, display: 'block' }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

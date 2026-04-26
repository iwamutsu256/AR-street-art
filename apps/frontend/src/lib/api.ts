import type { CanvasSnapshot, WallDetail, WallSummary } from '@street-art/shared';

export type HealthStatus = {
  ok: boolean;
  db: boolean;
  redis: boolean;
};

export function getApiUrl(path: string) {
  const normalizedPath = `/${path.replace(/^\//, '')}`;
  const internalApiOrigin = process.env.API_PROXY_TARGET?.replace(/\/$/, '');

  if (internalApiOrigin) {
    return new URL(normalizedPath, `${internalApiOrigin}/`).toString();
  }

  const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  const apiBasePath = (process.env.NEXT_PUBLIC_API_BASE ?? '/api').replace(/\/$/, '');
  return new URL(`${apiBasePath}${normalizedPath}`, appOrigin).toString();
}

export async function getHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(getApiUrl('/health'), { cache: 'no-store' });

    if (!res.ok) {
      return { ok: false, db: false, redis: false };
    }

    return res.json() as Promise<HealthStatus>;
  } catch {
    return { ok: false, db: false, redis: false };
  }
}

export async function getWalls(): Promise<WallSummary[]> {
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

export async function getWall(id: string): Promise<WallDetail | null> {
  try {
    const res = await fetch(getApiUrl(`/walls/${id}`), { cache: 'no-store' });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as WallDetail;
  } catch {
    return null;
  }
}

export async function getCanvasSnapshot(canvasId: string): Promise<CanvasSnapshot | null> {
  try {
    const res = await fetch(getApiUrl(`/canvases/${canvasId}`), { cache: 'no-store' });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as CanvasSnapshot;
  } catch {
    return null;
  }
}

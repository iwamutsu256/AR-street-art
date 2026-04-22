import { Buffer } from 'node:buffer';
import {
  DEFAULT_PALETTE_COLORS,
  normalizePixelValue,
  type CanvasSnapshot,
} from '@street-art/shared';
import { eq } from 'drizzle-orm';
import { canvases, palettes } from '../db/schema.js';
import { db } from '../lib/db.js';
import { redis } from '../lib/redis.js';

export const CANVAS_FLUSH_INTERVAL_MS = 5_000;
export const DIRTY_CANVAS_SET_KEY = 'canvas:dirty';

export type CanvasMeta = {
  id: string;
  wallId: string;
  width: number;
  height: number;
  paletteVersion: string;
  createdAt: string;
  updatedAt: string;
};

export function getCanvasPixelsKey(canvasId: string) {
  return `canvas:${canvasId}:pixels`;
}

export function getCanvasMetaKey(canvasId: string) {
  return `canvas:${canvasId}:meta`;
}

export function createBlankPixelData(width: number, height: number) {
  return Buffer.alloc(width * height, 0);
}

function createCanvasMeta(row: {
  id: string;
  wallId: string;
  width: number;
  height: number;
  paletteVersion: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    wallId: row.wallId,
    width: row.width,
    height: row.height,
    paletteVersion: row.paletteVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } satisfies CanvasMeta;
}

export function sanitizePixelBuffer(pixels: Buffer, paletteLength: number) {
  let sanitizedPixels: Buffer | null = null;

  for (let index = 0; index < pixels.length; index += 1) {
    const normalized = normalizePixelValue(pixels[index] ?? 0, paletteLength);

    if (normalized === pixels[index]) {
      continue;
    }

    sanitizedPixels ??= Buffer.from(pixels);
    sanitizedPixels[index] = normalized;
  }

  return sanitizedPixels ?? pixels;
}

function parseCanvasMeta(record: Record<string, string>) {
  if (
    !record.id ||
    !record.wallId ||
    !record.width ||
    !record.height ||
    !record.paletteVersion ||
    !record.createdAt ||
    !record.updatedAt
  ) {
    return null;
  }

  return {
    id: record.id,
    wallId: record.wallId,
    width: Number(record.width),
    height: Number(record.height),
    paletteVersion: record.paletteVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies CanvasMeta;
}

export async function ensureRedisReady() {
  if (redis.status === 'wait') {
    await redis.connect();
  }
}

export async function getCanvasMeta(canvasId: string): Promise<CanvasMeta | null> {
  await ensureRedisReady();

  const cachedMetaRecord = await redis.hgetall(getCanvasMetaKey(canvasId));
  const cachedMeta = parseCanvasMeta(cachedMetaRecord);
  if (cachedMeta) {
    return cachedMeta;
  }

  const [canvasRow] = await db
    .select({
      id: canvases.id,
      wallId: canvases.wallId,
      width: canvases.width,
      height: canvases.height,
      paletteVersion: canvases.paletteVersion,
      createdAt: canvases.createdAt,
      updatedAt: canvases.updatedAt,
    })
    .from(canvases)
    .where(eq(canvases.id, canvasId))
    .limit(1);

  if (!canvasRow) {
    return null;
  }

  const meta = createCanvasMeta(canvasRow);

  await redis.hset(getCanvasMetaKey(canvasId), {
    id: meta.id,
    wallId: meta.wallId,
    width: String(meta.width),
    height: String(meta.height),
    paletteVersion: meta.paletteVersion,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  });

  return meta;
}

export async function getPaletteColors(version: string) {
  const [paletteRow] = await db
    .select({ colors: palettes.colors })
    .from(palettes)
    .where(eq(palettes.version, version))
    .limit(1);

  return paletteRow?.colors ?? DEFAULT_PALETTE_COLORS;
}

export async function getCanvasState(canvasId: string) {
  await ensureRedisReady();

  const meta = await getCanvasMeta(canvasId);
  if (!meta) {
    return null;
  }

  let pixels = await redis.getBuffer(getCanvasPixelsKey(canvasId));

  if (pixels) {
    return { meta, pixels };
  }

  // ピクセルデータがRedisにない場合、DBから取得してキャッシュする
  const [canvasRow] = await db
    .select({ pixelData: canvases.pixelData })
    .from(canvases)
    .where(eq(canvases.id, canvasId))
    .limit(1);

  // メタデータはあるがピクセルデータがない、という状況は通常起こりにくいが、念のためハンドリング
  if (!canvasRow) {
    return null;
  }

  pixels =
    canvasRow.pixelData && canvasRow.pixelData.length === meta.width * meta.height
      ? Buffer.from(canvasRow.pixelData)
      : createBlankPixelData(meta.width, meta.height);

  await redis.set(getCanvasPixelsKey(canvasId), pixels);

  return { meta, pixels };
}

export function buildCanvasSnapshot(meta: CanvasMeta, pixels: Buffer, palette: string[]): CanvasSnapshot {
  return {
    type: 'canvas:snapshot',
    canvasId: meta.id,
    wallId: meta.wallId,
    width: meta.width,
    height: meta.height,
    paletteVersion: meta.paletteVersion,
    palette,
    pixels: pixels.toString('base64'),
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

export async function getCanvasSnapshot(canvasId: string) {
  const state = await getCanvasState(canvasId);

  if (!state) {
    return null;
  }

  const palette = await getPaletteColors(state.meta.paletteVersion);
  const pixels = sanitizePixelBuffer(state.pixels, palette.length);

  if (pixels !== state.pixels) {
    await Promise.all([
      redis.set(getCanvasPixelsKey(canvasId), pixels),
      redis.sadd(DIRTY_CANVAS_SET_KEY, canvasId),
    ]);
  }

  return buildCanvasSnapshot(state.meta, pixels, palette);
}

export async function flushDirtyCanvases() {
  try {
    await ensureRedisReady();
    const dirtyCanvasIds = await redis.smembers(DIRTY_CANVAS_SET_KEY);

    for (const canvasId of dirtyCanvasIds) {
      const state = await getCanvasState(canvasId);

      if (!state) {
        await redis.srem(DIRTY_CANVAS_SET_KEY, canvasId);
        continue;
      }

      await db
        .update(canvases)
        .set({
          pixelData: state.pixels,
          updatedAt: new Date(state.meta.updatedAt),
        })
        .where(eq(canvases.id, canvasId));

      await redis.srem(DIRTY_CANVAS_SET_KEY, canvasId);
    }
  } catch (error) {
    console.error('[canvas] Failed to flush dirty canvases:', error);
  }
}

export function startCanvasFlushInterval() {
  const canvasFlushInterval = setInterval(() => {
    void flushDirtyCanvases();
  }, CANVAS_FLUSH_INTERVAL_MS);

  canvasFlushInterval.unref?.();

  return canvasFlushInterval;
}

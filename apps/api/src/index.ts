import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { IncomingMessage, Server } from 'node:http';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import {
  CANVAS_MAX_SIZE,
  DEFAULT_PALETTE_COLORS,
  DEFAULT_PALETTE_VERSION,
  normalizePixelValue,
  type CanvasSnapshot,
  type PixelAppliedMessage,
} from '@street-art/shared';
import { asc, eq } from 'drizzle-orm';
import { WebSocketServer, WebSocket } from 'ws';
import { env } from './lib/env.js';
import { db, sql } from './lib/db.js';
import { redis } from './lib/redis.js';
import { canvases, palettes, walls } from './db/schema.js';
import { uploadWallImagesToR2 } from './lib/s3.js';

const app = new Hono();

app.use('*', cors({ origin: env.appOrigin, credentials: true }));

const CANVAS_FLUSH_INTERVAL_MS = 5_000;
const DIRTY_CANVAS_SET_KEY = 'canvas:dirty';

type CanvasMeta = {
  id: string;
  wallId: string;
  width: number;
  height: number;
  paletteVersion: string;
  createdAt: string;
  updatedAt: string;
};

function getCanvasPixelsKey(canvasId: string) {
  return `canvas:${canvasId}:pixels`;
}

function getCanvasMetaKey(canvasId: string) {
  return `canvas:${canvasId}:meta`;
}

function createBlankPixelData(width: number, height: number) {
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

function sanitizePixelBuffer(pixels: Buffer, paletteLength: number) {
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

function parseCornerCoordinates(value: unknown) {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
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

async function getPaletteColors(version: string) {
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

function buildCanvasSnapshot(meta: CanvasMeta, pixels: Buffer, palette: string[]): CanvasSnapshot {
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

async function getCanvasSnapshot(canvasId: string) {
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

async function flushDirtyCanvases() {
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

const canvasFlushInterval = setInterval(() => {
  void flushDirtyCanvases();
}, CANVAS_FLUSH_INTERVAL_MS);

canvasFlushInterval.unref?.();

app.get('/', (c) => c.json({ ok: true, service: 'api' }));

app.get('/health', async (c) => {
  let dbOk = false;
  let redisOk = false;

  try {
    await sql`select 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    await redis.ping();
    redisOk = true;
  } catch {
    redisOk = false;
  }

  const ok = dbOk && redisOk;
  return c.json({ ok, db: dbOk, redis: redisOk }, ok ? 200 : 503);
});

/**
 * 壁一覧を返す
 */
app.get('/walls', async (c) => {
  // `select()`で全カラムを取得すると、`jsonb`型の`cornerCoordinates`の処理で問題が発生する可能性があるため、
  // レスポンスに必要なカラムのみを明示的に指定して取得します。
  const allWalls = await db
    .select({
      id: walls.id,
      name: walls.name,
      latitude: walls.latitude,
      longitude: walls.longitude,
      thumbnailImageUrl: walls.thumbnailImageUrl,
    })
    .from(walls)
    .orderBy(asc(walls.createdAt));

  const result = allWalls.map((wall) => ({
    id: wall.id,
    name: wall.name,
    latitude: wall.latitude,
    longitude: wall.longitude,
    photoUrl: wall.thumbnailImageUrl,
  }));

  return c.json(result);
});

/**
 * 指定された壁を返す
 */
app.get('/walls/:id', async (c) => {
  const id = c.req.param('id');
  const [[row] = [], [canvasRow] = []] = await Promise.all([
    db
      .select({
        id: walls.id,
        name: walls.name,
        latitude: walls.latitude,
        longitude: walls.longitude,
        originalImageUrl: walls.originalImageUrl,
        thumbnailImageUrl: walls.thumbnailImageUrl,
        rectifiedImageUrl: walls.rectifiedImageUrl,
        cornerCoordinates: walls.cornerCoordinates,
        approxHeading: walls.approxHeading,
        visibilityRadiusM: walls.visibilityRadiusM,
        createdAt: walls.createdAt,
      })
      .from(walls)
      .where(eq(walls.id, id))
      .limit(1),
    db
      .select({
        id: canvases.id,
        width: canvases.width,
        height: canvases.height,
        paletteVersion: canvases.paletteVersion,
      })
      .from(canvases)
      .where(eq(canvases.wallId, id))
      .orderBy(asc(canvases.createdAt))
      .limit(1),
  ]);

  if (!row) {
    return c.json({ message: 'Wall not found' }, 404);
  }

  const responseData = {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    originalImageUrl: row.originalImageUrl,
    thumbnailImageUrl: row.thumbnailImageUrl,
    rectifiedImageUrl: row.rectifiedImageUrl,
    cornerCoordinates: parseCornerCoordinates(row.cornerCoordinates),
    approxHeading: row.approxHeading,
    visibilityRadiusM: row.visibilityRadiusM,
    createdAt: row.createdAt,
    photoUrl: row.thumbnailImageUrl,
    canvas: canvasRow ?? null,
  };
  return c.json(responseData);
});

const createWallSchema = z.object({
  name: z.string().min(1, 'name is required'),
  latitude: z.preprocess(
    (val) => Number(val),
    z.number().min(-90).max(90, 'latitude must be between -90 and 90')
  ),
  longitude: z.preprocess(
    (val) => Number(val),
    z.number().min(-180).max(180, 'longitude must be between -180 and 180')
  ),
  approxHeading: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().int().min(0).max(359).optional()
  ),
  visibilityRadiusM: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().int().positive('visibilityRadiusM must be a positive integer').optional().default(30)
  ),
  cornerCoordinates: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch (e) {
          return val;
        }
      }
      return val;
    },
    z.array(
      z.object({
        x: z.preprocess((val) => Number(val), z.number()),
        y: z.preprocess((val) => Number(val), z.number()),
      })
    ).length(4, 'cornerCoordinates must be an array of 4 points')
  ),
  canvasWidth: z.preprocess(
    (val) => Number(val),
    z.number().int().positive().max(CANVAS_MAX_SIZE, `canvasWidth must be <= ${CANVAS_MAX_SIZE}`)
  ),
  canvasHeight: z.preprocess(
    (val) => Number(val),
    z.number().int().positive().max(CANVAS_MAX_SIZE, `canvasHeight must be <= ${CANVAS_MAX_SIZE}`)
  ),
});

/**
 * 壁を登録する
 */
app.post('/walls', async (c) => {
  const body = await c.req.parseBody();
  const allErrors: z.ZodIssue[] = [];

  // 1. Zodスキーマでテキストフィールドと座標を検証
  const parsed = createWallSchema.safeParse(body);
  if (!parsed.success) {
    allErrors.push(...parsed.error.issues);
  }

  // 2. 画像ファイルを個別に検証し、エラーを収集
  const imageFields = ['originalImageFile', 'thumbnailImageFile', 'rectifiedImageFile'];
  for (const fieldName of imageFields) {
    const file = body[fieldName];
    const isFile = (input: unknown): input is File => {
      return typeof input === 'object' && input !== null && 'arrayBuffer' in input && 'type' in input;
    };

    if (!isFile(file) || file.size === 0) {
      allErrors.push({
        code: z.ZodIssueCode.custom,
        path: [fieldName],
        message: `A non-empty image file is required for ${fieldName}.`,
      });
    } else if (!file.type.startsWith('image/')) {
      allErrors.push({
        code: z.ZodIssueCode.custom,
        path: [fieldName],
        message: `Unsupported file type for ${fieldName}: ${file.type}.`,
      });
    }
  }

  // 3. エラーが一つでもあれば、すべてまとめて返す
  if (allErrors.length > 0) {
    return c.json({ errors: allErrors }, 400);
  }

  // ここまで来れば、すべてのデータは有効
  const {
    name,
    latitude,
    longitude,
    approxHeading,
    visibilityRadiusM,
    cornerCoordinates,
    canvasWidth,
    canvasHeight,
  } = parsed.data!;
  const originalImageFile = body['originalImageFile'] as File;
  const thumbnailImageFile = body['thumbnailImageFile'] as File;
  const rectifiedImageFile = body['rectifiedImageFile'] as File;

  try {
    const newWallId = randomUUID();

    // 3つのファイルとwallIdを渡してアップロード
    const uploadedUrls = await uploadWallImagesToR2(
      newWallId,
      originalImageFile,
      thumbnailImageFile,
      rectifiedImageFile
    );
    
    const created = await db.transaction(async (tx) => {
      const [newWall] = await tx
        .insert(walls)
        .values({
          id: newWallId,
          name,
          latitude,
          longitude,
          originalImageUrl: uploadedUrls.originalImageUrl,
          thumbnailImageUrl: uploadedUrls.thumbnailImageUrl,
          rectifiedImageUrl: uploadedUrls.rectifiedImageUrl,
          cornerCoordinates,
          approxHeading,
          visibilityRadiusM,
        })
        .returning();

      const [newCanvas] = await tx
        .insert(canvases)
        .values({
          id: randomUUID(),
          wallId: newWallId,
          width: canvasWidth,
          height: canvasHeight,
          paletteVersion: DEFAULT_PALETTE_VERSION,
          pixelData: createBlankPixelData(canvasWidth, canvasHeight),
        })
        .returning({
          id: canvases.id,
          width: canvases.width,
          height: canvases.height,
          paletteVersion: canvases.paletteVersion,
        });

      return { newWall, newCanvas };
    });

    return c.json(
      {
        ...created.newWall,
        photoUrl: created.newWall.thumbnailImageUrl,
        canvas: created.newCanvas,
        message: 'Wall created successfully',
      },
      201
    );
  } catch (error) {
    console.error('Failed to create wall or upload images:', error);
    return c.json({ message: `Failed to create wall: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }
});

const createCanvasSchema = z.object({
  width: z.preprocess(
    (val) => Number(val),
    z.number()
      .int()
      .positive('width must be a positive integer')
      .max(CANVAS_MAX_SIZE, `max width is ${CANVAS_MAX_SIZE}`)
  ),
  height: z.preprocess(
    (val) => Number(val),
    z.number()
      .int()
      .positive('height must be a positive integer')
      .max(CANVAS_MAX_SIZE, `max height is ${CANVAS_MAX_SIZE}`)
  ),
  paletteVersion: z.string().min(1).optional().default(DEFAULT_PALETTE_VERSION),
});

app.post('/walls/:wallId/canvases', async (c) => {
  const wallId = c.req.param('wallId');
  const body = await c.req.json();
  const [existingWall] = await db.select({ id: walls.id }).from(walls).where(eq(walls.id, wallId)).limit(1);

  if (!existingWall) {
    return c.json({ message: 'wall not found' }, 404);
  }

  const parsed = createCanvasSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ errors: parsed.error.issues }, 400);
  }

  const { width, height, paletteVersion } = parsed.data;
  const [existingPalette] = await db
    .select({ version: palettes.version })
    .from(palettes)
    .where(eq(palettes.version, paletteVersion))
    .limit(1);

  if (!existingPalette) {
    return c.json({ message: 'palette not found' }, 400);
  }

  try {
    const newCanvasId = randomUUID();
    const [newCanvas] = await db
      .insert(canvases)
      .values({
        id: newCanvasId,
        wallId,
        width,
        height,
        paletteVersion,
        pixelData: createBlankPixelData(width, height),
      })
      .returning();

    const responseData = {
      id: newCanvas.id,
      wallId: newCanvas.wallId,
      width: newCanvas.width,
      height: newCanvas.height,
      paletteVersion: newCanvas.paletteVersion,
      createdAt: newCanvas.createdAt,
      updatedAt: newCanvas.updatedAt,
      message: 'canvas created successfully',
    };

    return c.json(responseData, 201);
  } catch (error) {
    console.error('Failed to create canvas:', error);
    return c.json(
      { message: `Failed to create canvas: ${error instanceof Error ? error.message : 'Unknown error'}` },
      500
    );
  }
});

app.get('/canvases/:canvasId', async (c) => {
  const canvasId = c.req.param('canvasId');
  const snapshot = await getCanvasSnapshot(canvasId);

  if (!snapshot) {
    return c.json({ message: 'canvas not found' }, 404);
  }

  return c.json(snapshot);
});

const server = serve(
  {
    fetch: app.fetch,
    port: env.apiPort,
  },
  (info) => {
    console.log(`API server listening on http://localhost:${info.port}`);
  }
);

const wss = new WebSocketServer({ server: server as Server });
const canvasConnections = new Map<string, Set<WebSocket>>();

function broadcastToCanvasClients(canvasId: string, message: string) {
  const connections = canvasConnections.get(canvasId);
  if (connections) {
    console.log(`[WS] Broadcasting to ${connections.size} client(s) on canvas ${canvasId}: ${message}`);
    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          // 一部のクライアントへの送信に失敗しても、他のクライアントへの送信を続ける
          console.error(`[WS] Failed to send message to a client on canvas ${canvasId}:`, error);
        }
      }
    });
  } else {
    console.log(`[WS] No clients to broadcast to on canvas ${canvasId}.`);
  }
}

const pixelSetSchema = z.object({
  type: z.literal('pixel:set'),
  canvasId: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  color: z.number().int().min(0),
});

const pixelsSetSchema = z.object({
  type: z.literal('pixels:set'),
  canvasId: z.string().min(1),
  pixels: z.array(
    z.object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      color: z.number().int().min(0),
    })
  ).min(1).max(500), // 一度に送信できるピクセル数に上限を設定
});

function sendWebSocketMessage(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function broadcastCanvasSnapshot(ws: WebSocket, canvasId: string) {
  const snapshot = await getCanvasSnapshot(canvasId);

  if (!snapshot) {
    sendWebSocketMessage(ws, { type: 'error', message: 'Canvas not found' });
    ws.close(1008, 'canvas not found');
    return;
  }

  sendWebSocketMessage(ws, snapshot);
}

export async function handleCanvasUpdate(ws: WebSocket, canvasId: string, rawMessage: string) {
  try {
    // メタデータを取得。WebSocketセッションでキャッシュされているか、Redisキャッシュから取得
    let meta = (ws as any).canvasMeta as CanvasMeta | undefined;
    if (!meta || meta.id !== canvasId) {
      const newMeta = await getCanvasMeta(canvasId);
      if (newMeta) {
        (ws as any).canvasMeta = newMeta;
        meta = newMeta;
      }
    }

    if (!meta) {
      sendWebSocketMessage(ws, { type: 'error', message: 'Canvas not found' });
      return;
    }

    const parsedJson = JSON.parse(rawMessage);
    const messageType = parsedJson?.type;

    if (messageType === 'pixel:set') {
      const parsedMessage = pixelSetSchema.safeParse(parsedJson);
      if (!parsedMessage.success) {
        sendWebSocketMessage(ws, { type: 'error', message: 'invalid message format', issues: parsedMessage.error.issues });
        return;
      }

      const { canvasId: incomingCanvasId, x, y, color: requestedColor } = parsedMessage.data;
      if (incomingCanvasId !== canvasId) {
        sendWebSocketMessage(ws, { type: 'error', message: 'canvasId does not match the connected canvas' });
        return;
      }

      if (x >= meta.width || y >= meta.height) {
        sendWebSocketMessage(ws, { type: 'error', message: 'Pixel coordinates out of bounds' });
        return;
      }

      const palette = await getPaletteColors(meta.paletteVersion);
      const color = normalizePixelValue(requestedColor, palette.length);
      await ensureRedisReady();
      const updatedAt = new Date().toISOString();
      const offset = y * meta.width + x;

      await redis
        .multi()
        .setrange(getCanvasPixelsKey(canvasId), offset, String.fromCharCode(color))
        .hset(getCanvasMetaKey(canvasId), 'updatedAt', updatedAt)
        .sadd(DIRTY_CANVAS_SET_KEY, canvasId)
        .exec();

      const broadcastPayload: PixelAppliedMessage = { type: 'pixel:applied', canvasId, x, y, color };
      const encodedPayload = JSON.stringify(broadcastPayload);
      broadcastToCanvasClients(canvasId, encodedPayload);

    } else if (messageType === 'pixels:set') {
      const parsedMessage = pixelsSetSchema.safeParse(parsedJson);
      if (!parsedMessage.success) {
        sendWebSocketMessage(ws, { type: 'error', message: 'invalid message format', issues: parsedMessage.error.issues });
        return;
      }

      const { canvasId: incomingCanvasId, pixels } = parsedMessage.data;
      if (incomingCanvasId !== canvasId) {
        sendWebSocketMessage(ws, { type: 'error', message: 'canvasId does not match the connected canvas' });
        return;
      }

      const palette = await getPaletteColors(meta.paletteVersion);
      const validPixels = pixels
        .filter(p => p.x < meta.width && p.y < meta.height)
        .map((p) => ({
          ...p,
          color: normalizePixelValue(p.color, palette.length),
        }));
      if (validPixels.length === 0) {
        return; // 更新するピクセルがない
      }

      await ensureRedisReady();
      const updatedAt = new Date().toISOString();
      const multi = redis.multi();

      for (const pixel of validPixels) {
        const offset = pixel.y * meta.width + pixel.x;
        // pixel:set と同じ setrange を使用して一貫性を保ち、堅牢性を高める
        multi.setrange(getCanvasPixelsKey(canvasId), offset, String.fromCharCode(pixel.color));
      }

      multi.hset(getCanvasMetaKey(canvasId), 'updatedAt', updatedAt);
      multi.sadd(DIRTY_CANVAS_SET_KEY, canvasId);
      await multi.exec();

      // `PixelsAppliedMessage` に相当するオブジェクトを作成
      const broadcastPayload = {
        type: 'pixels:applied',
        canvasId,
        pixels: validPixels,
      };
      const encodedPayload = JSON.stringify(broadcastPayload);
      broadcastToCanvasClients(canvasId, encodedPayload);
    } else {
      sendWebSocketMessage(ws, { type: 'error', message: `unknown message type: ${messageType}` });
    }
  } catch (error) {
    console.error(`[WS] Error processing message for canvas ${canvasId}:`, error);
    sendWebSocketMessage(ws, { type: 'error', message: 'Failed to process message' });
  }
}

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (pathSegments[0] !== 'ws' || pathSegments[1] !== 'canvases' || !pathSegments[2]) {
    ws.close(1008, 'invalid WebSocket path');
    return;
  }

  const canvasId = pathSegments[2];

  if (!canvasConnections.has(canvasId)) {
    canvasConnections.set(canvasId, new Set());
  }

  canvasConnections.get(canvasId)?.add(ws);
  console.log(`[WS] Client connected to canvas: ${canvasId}. Total connections for this canvas: ${canvasConnections.get(canvasId)?.size}`);
  // 接続時にキャンバスのスナップショットを送信し、メタデータをキャッシュする
  (async () => {
    const state = await getCanvasState(canvasId);
    if (!state) {
      sendWebSocketMessage(ws, { type: 'error', message: 'Canvas not found' });
      ws.close(1008, 'canvas not found');
      return;
    }
    (ws as any).canvasMeta = state.meta;

    const palette = await getPaletteColors(state.meta.paletteVersion);
    const pixels = sanitizePixelBuffer(state.pixels, palette.length);

    if (pixels !== state.pixels) {
      await Promise.all([
        redis.set(getCanvasPixelsKey(canvasId), pixels),
        redis.sadd(DIRTY_CANVAS_SET_KEY, canvasId),
      ]);
    }

    const snapshot = buildCanvasSnapshot(state.meta, pixels, palette);
    sendWebSocketMessage(ws, snapshot);
  })().catch(err => console.error(`[WS] Error during connection init for ${canvasId}:`, err));

  ws.on('message', (message) => {
    // 単一または複数のピクセル更新を処理し、Redis経由でブロードキャストする
    void handleCanvasUpdate(ws, canvasId, message.toString());
  });

  ws.on('close', () => {
    const connections = canvasConnections.get(canvasId);
    connections?.delete(ws);

    if (connections?.size === 0) {
      canvasConnections.delete(canvasId);
    }
    console.log(`[WS] Client disconnected from canvas: ${canvasId}. Total connections for this canvas: ${connections?.size ?? 0}`);
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error on canvas ${canvasId}:`, error);
  });
});

console.log('WebSocket server is running.');

let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  clearInterval(canvasFlushInterval);
  await flushDirtyCanvases();

  try {
    if (redis.status === 'ready' || redis.status === 'connect' || redis.status === 'wait') {
      await redis.quit();
    }
  } catch {
    redis.disconnect();
  }
}

process.once('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.once('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

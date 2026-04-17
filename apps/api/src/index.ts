import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { IncomingMessage, Server } from 'node:http';
import sharp from 'sharp';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { CANVAS_MAX_SIZE } from '@street-art/shared';
import { asc, eq, sql as drizzleSql } from 'drizzle-orm';
import { WebSocketServer, WebSocket } from 'ws';
import { env } from './lib/env.js';
import { db, sql } from './lib/db.js';
import { redis } from './lib/redis.js';
import { canvases, walls } from './db/schema.js';
import { uploadWallImagesToR2 } from './lib/s3.js';

const app = new Hono();

app.use('*', cors({ origin: env.appOrigin, credentials: true }));

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
  // select()で全カラムを取得するのではなく、必要なカラムを明示的に指定します。
  // これにより、jsonb型などの特殊な型を安全に扱うことができます。
  const [row] = await db
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
    .limit(1);

  if (!row) {
    return c.json({ message: 'Wall not found' }, 404);
  }

  // Drizzleから返される生のオブジェクトを直接シリアライズする際の問題を避けるため、
  // レスポンスオブジェクトを明示的に構築します。
  // また、cornerCoordinatesはドライバの挙動によって文字列として返されることがあるため、
  // 型をチェックして必要であればJSON.parseでパースします。
  const responseData = {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    originalImageUrl: row.originalImageUrl,
    thumbnailImageUrl: row.thumbnailImageUrl,
    rectifiedImageUrl: row.rectifiedImageUrl,
    cornerCoordinates:
      typeof row.cornerCoordinates === 'string'
        ? JSON.parse(row.cornerCoordinates)
        : row.cornerCoordinates,
    approxHeading: row.approxHeading,
    visibilityRadiusM: row.visibilityRadiusM,
    createdAt: row.createdAt,
    photoUrl: row.thumbnailImageUrl, // フロントエンドのWallSummaryとの互換性のため
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
    z.number().int().positive('width must be a positive integer').max(512, "max width is 512")
  ),
  height: z.preprocess(
    (val) => Number(val),
    z.number().int().positive('height must be a positive integer').max(512, 'max height is 512')
  ),
  paletteVersion: z.string().optional().default('v1'),
});

app.post('/walls/:wallId/canvases', async (c) => {
  const wallId = c.req.param('wallId');
  const body = await c.req.json();
  const [existingWall] = await db.select({ id: walls.id }).from(walls).where(eq(walls.id, wallId)).limit(1);
  if (!existingWall) {
    return c.json({ message: 'wall not found'}, 404);
  }
  const parsed = createCanvasSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ errors: parsed.error.issues }, 400);
  }
  const { width, height, paletteVersion } = parsed.data;
  const pixelDataBuffer = Buffer.alloc(width * height, 0);

  try {
    const newCanvasId = randomUUID();
    const [newCanvas] = await db.insert(canvases).values({ 
      id: newCanvasId,
      wallId: wallId,
      width: width,
      height: height,
      paletteVersion: paletteVersion,
      pixelData: pixelDataBuffer,
    }).returning();
    // Drizzleから返される生のオブジェクトを直接シリアライズする際の問題を避けるため、
    // レスポンスオブジェクトを明示的に構築します。
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
    return c.json({ message: `Failed to create canvas: ${error instanceof Error ? error.message : 'Unknown error'}`});
  }
});

app.get('/canvases/:canvasId', async (c) => {
  const canvasId = c.req.param('canvasId');
  // select()やスプレッド構文(...canvasRow)を避け、明示的にカラム指定とレスポンス構築を行います。
  const [canvasRow] = await db.select().from(canvases).where(eq(canvases.id, canvasId)).limit(1);
  if (!canvasRow || !canvasRow.pixelData) {
    return c.json({ message: 'canvas not found' }, 404);
  }
  const pixelDataBase64 = Buffer.from(canvasRow.pixelData).toString('base64');

  const responseData = {
    id: canvasRow.id,
    wallId: canvasRow.wallId,
    width: canvasRow.width,
    height: canvasRow.height,
    paletteVersion: canvasRow.paletteVersion,
    createdAt: canvasRow.createdAt,
    updatedAt: canvasRow.updatedAt,
    pixelData: pixelDataBase64,
  };

  return c.json(responseData);
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

const pixelUpdateSchema = z.object({
  type: z.literal('pixelUpdate'),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  colorIndex: z.number().int().min(0).max(63),
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  if (pathSegments[0] !== 'ws' || pathSegments[1] !== 'canvases' || !pathSegments[2]) {
    ws.close(1008, 'invalid WebSocket path');
    return;
  }
  const canvasId = pathSegments[2];
  console.log(`[WS] Client connected to canfas: ${canvasId}`);
  if (!canvasConnections.has(canvasId)) {
    canvasConnections.set(canvasId, new Set());
  }
  canvasConnections.get(canvasId)!.add(ws);
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const parsed = pixelUpdateSchema.safeParse(data);
      if (!parsed.success) {
        ws.send(JSON.stringify({ type: 'error', message: 'invalid message format', issues: parsed.error.issues }));
        return;
      }
      
      const { x, y, colorIndex } = parsed.data;
      const [canvas] = await db.select({ width: canvases.width, height: canvases.height, pixelData: canvases.pixelData }).from(canvases).where(eq(canvases.id, canvasId)).limit(1);
      if (!canvas || !canvas.pixelData) {
        ws.send(JSON.stringify({ type: 'error', message: 'Canvas not found' }));
        return;
      }

      if (x >= canvas.width || y >= canvas.height) {
        ws.send(JSON.stringify({ type: 'error', message: 'Pixel coordinates out of bounds' }));
        return;
      }

      const updatedPixelData = Buffer.from(canvas.pixelData);
      const offset = y * canvas.width + x;
      updatedPixelData[offset] = colorIndex;

      await db.update(canvases).set({ pixelData: updatedPixelData, updatedAt: new Date() }).where(eq(canvases.id, canvasId));

      const broadcastMessage = JSON.stringify({ type: 'pixelUpdate', x, y, colorIndex });
      canvasConnections.get(canvasId)?.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(broadcastMessage);
        }
      });
    } catch (e) {
      console.error(`[WS] Error processing message for canvas ${canvasId}:`, e);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected from canvas: ${canvasId}`);
    const connections = canvasConnections.get(canvasId);
    connections?.delete(ws);
    if (connections?.size === 0) {
      canvasConnections.delete(canvasId);
    }
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error on canvas ${canvasId}:`, error);
  });
});

console.log('WebSocket server is running.');

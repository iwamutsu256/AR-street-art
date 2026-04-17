import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { CANVAS_MAX_SIZE } from '@street-art/shared';
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

app.get('/walls', async (c) => {
  const rows = await db
    .select({
      id: walls.id,
      name: walls.name,
      latitude: walls.latitude,
      longitude: walls.longitude,
      photoUrl: walls.thumbnailImageUrl,
    })
    .from(walls)
    .orderBy(asc(walls.createdAt));
  return c.json(rows);
});

app.get('/walls/:id', async (c) => {
  const id = c.req.param('id');
  const [row] = await db
    .select()
    .from(walls)
    .where(eq(walls.id, id))
    .limit(1);

  if (!row) {
    return c.json({ message: 'Wall not found' }, 404);
  }

  const [canvas] = await db
    .select({
      id: canvases.id,
      width: canvases.width,
      height: canvases.height,
      paletteVersion: canvases.paletteVersion,
    })
    .from(canvases)
    .where(eq(canvases.wallId, id))
    .orderBy(asc(canvases.createdAt))
    .limit(1);

  return c.json({
    ...row,
    photoUrl: row.thumbnailImageUrl,
    canvas: canvas ?? null,
  });
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

serve({
  fetch: app.fetch,
  port: env.apiPort,
});

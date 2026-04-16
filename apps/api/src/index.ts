import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { env } from './lib/env.js';
import { db, sql } from './lib/db.js';
import { redis } from './lib/redis.js';
import { walls } from './db/schema.js';
import { uploadWallImagesToR2 } from './lib/s3.js';

type WallSummary = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  thumbnailImageUrl: string | null;
};

function buildDefaultCornerCoordinates(width: number, height: number) {
  const insetX = Math.max(24, Math.round(width * 0.08));
  const insetY = Math.max(24, Math.round(height * 0.08));

  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY },
  ];
}

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
  const rows = await sql<WallSummary[]>`
    SELECT id, name, latitude, longitude, thumbnail_image_url AS "thumbnailImageUrl"
    FROM walls
    ORDER BY created_at ASC
  `;
  return c.json(rows);
});

app.get('/walls/:id', async (c) => {
  const id = c.req.param('id');
  const rows = await sql<WallSummary[]>`
    SELECT id, name, latitude, longitude, thumbnail_image_url AS "thumbnailImageUrl"
    FROM walls
    WHERE id = ${id}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return c.json({ message: 'Wall not found' }, 404);
  }

  return c.json(rows[0]);
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
});

app.post('/walls', async (c) => {
  const body = await c.req.parseBody();
  
  const cornerCoordinatesString = body['cornerCoordinates'];
  
  const parsed = createWallSchema.safeParse({
    ...body,
    cornerCoordinates: cornerCoordinatesString,
  });
  if (!parsed.success) {
    return c.json({ errors: parsed.error.issues }, 400);
  }

  const { name, latitude, longitude, approxHeading, visibilityRadiusM, cornerCoordinates } = parsed.data;
  
  const originalImageFile = body['originalImageFile'];
  const thumbnailImageFile = body['thumbnailImageFile'];
  const rectifiedImageFile = body['rectifiedImageFile'];

  const validateImageFile = (file: unknown, fieldName: string) => {
    const isFile = (input: unknown): input is File => {
      return typeof input === 'object' && input !== null && 'arrayBuffer' in input && 'type' in input;
    };

    if (!isFile(file)) {
      return `${fieldName} (image file) is required`;
    }
    if (!file.type.startsWith('image/')) {
      return `Unsupported file type for ${fieldName}: ${file.type}. Only image files are allowed.`;
    }
    return null;
  }

  let validationError = validateImageFile(originalImageFile, 'originalImageFile');
  if (validationError) return c.json({ message: validationError }, 400);

  validationError = validateImageFile(thumbnailImageFile, 'thumbnailImageFile');
  if (validationError) return c.json({ message: validationError }, 400);

  validationError = validateImageFile(rectifiedImageFile, 'rectifiedImageFile');
  if (validationError) return c.json({ message: validationError }, 400);

  const newWallId = randomUUID();

  let originalImageUrl: string | undefined;
  let thumbnailImageUrl: string | undefined;
  let rectifiedImageUrl: string | undefined;

  try {
    // 3つのファイルとwallIdを渡してアップロード
    const uploadedUrls = await uploadWallImagesToR2(
      newWallId,
      originalImageFile as File, // 型アサーション
      thumbnailImageFile as File,
      rectifiedImageFile as File
    );
    originalImageUrl = uploadedUrls.originalImageUrl;
    thumbnailImageUrl = uploadedUrls.thumbnailImageUrl;
    rectifiedImageUrl = uploadedUrls.rectifiedImageUrl;
  } catch (error) {
    console.error('Failed to upload images to R2:', error);
    return c.json({ message: `Failed to upload images: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }

  try {
    await db.insert(walls).values({
      id: newWallId,
      name: name,
      latitude: latitude,
      longitude: longitude,
      originalImageUrl: originalImageUrl,
      thumbnailImageUrl: thumbnailImageUrl,
      rectifiedImageUrl: rectifiedImageUrl,
      cornerCoordinates: cornerCoordinates,
      approxHeading: approxHeading,
      visibilityRadiusM: visibilityRadiusM,
    });

    return c.json(
      {
        id: newWallId,
        name,
        latitude,
        longitude,
        originalImageUrl,
        thumbnailImageUrl,
        rectifiedImageUrl,
        cornerCoordinates,
        message: 'Wall created successfully',
      },
      201
    );
  } catch (error) {
    console.error('Failed to create wall:', error);
    return c.json({ message: 'Failed to create wall' }, 500);
  }
});

serve({
  fetch: app.fetch,
  port: env.apiPort,
});

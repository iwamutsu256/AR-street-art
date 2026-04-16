import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { multipart } from '@hono/multipart';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { WallSummary } from '@street-art/shared';
import { env } from './lib/env.js';
import { db, sql } from './lib/db.js';
import { redis } from './lib/redis.js';
import { walls } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { uploadToR2AsJpeg } from './lib/s3.js';


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
    SELECT id, name, latitude, longitude, photo_url AS "photoUrl"
    FROM walls
    ORDER BY created_at ASC
  `;
  return c.json(rows);
});

app.get('/walls/:id', async (c) => {
  const id = c.req.param('id');
  const rows = await sql<WallSummary[]>`
    SELECT id, name, latitude, longitude, photo_url AS "photoUrl"
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
});

app.post('/walls',multipart(), async (c) => {
  const body = await c.req.parseBody();

  const parsed = createWallSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ errors: parsed.error.errors }, 400);
  }
  const { name, latitude, longitude, approxHeading, visibilityRadiusM } = parsed.data;

  const photoFile = body['photoFile'];
  if (!photoFile || typeof photoFile === 'string' || !('arrayBuffer' in photoFile)) {
    return c.json({ message: 'photoFile (image file is required' }, 400);
  }

  if (!photoFile.type.startsWith('image/')) {
    return c.json({ message: `Unsupported file type: ${photoFile.type}. Only image files are allowed.` }, 400);
  }

  const photoBuffer = Buffer.from(await photoFile.arrayBuffer());
  const newWallId = uuidv4();
  const s3KeyBase = `walls/${newWallId}/${Date.now()}`; // R2に保存するキー

  let photoUrl: string | undefined;
  try {
    photoUrl = await uploadToR2AsJpeg(s3KeyBase, photoBuffer, photoFile.type);
  } catch (error) {
    console.error('Failed to upload image to R2:', error);
    return c.json({ message: `Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
  }

  try {
    await db.insert(walls).values({
      id: newWallId,
      name: name,
      latitude: latitude,
      longitude: longitude,
      photoUrl: photoUrl, // R2から取得したURLを保存
      approxHeading: approxHeading,
      visibilityRadiusM: visibilityRadiusM,
      createdAt: new Date(),
    });

    return c.json({ id: newWallId, name, latitude, longitude, photoUrl, message: 'Wall created successfully' }, 201);
  } catch (error) {
    console.error('Failed to create wall:', error);
    return c.json({ message: 'Failed to create wall' }, 500);
  }
});

serve({
  fetch: app.fetch,
  port: env.apiPort,
});

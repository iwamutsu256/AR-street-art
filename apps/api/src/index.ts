import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { WallSummary } from '@street-art/shared';
import { env } from './lib/env.js';
import { sql } from './lib/db.js';
import { redis } from './lib/redis.js';

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

serve({
  fetch: app.fetch,
  port: env.apiPort,
});

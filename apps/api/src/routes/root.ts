import { Hono } from 'hono';
import { sql } from '../lib/db.js';
import { redis } from '../lib/redis.js';

export const rootApp = new Hono();

rootApp.get('/', (c) => c.json({ ok: true, service: 'api' }));

rootApp.get('/health', async (c) => {
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

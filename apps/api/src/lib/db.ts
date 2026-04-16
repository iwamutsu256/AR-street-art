import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.js';
import { env } from './env.js';

export const sql = postgres(env.databaseUrl, {
  max: 5,
  idle_timeout: 20,
});

export const db = drizzle(sql, { schema });

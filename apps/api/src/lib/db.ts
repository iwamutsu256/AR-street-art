import postgres from 'postgres';
import { env } from './env.js';

export const sql = postgres(env.databaseUrl, {
  max: 5,
  idle_timeout: 20,
});

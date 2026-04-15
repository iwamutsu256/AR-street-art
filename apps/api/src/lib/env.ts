export const env = {
  apiPort: Number(process.env.API_PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@postgres:5432/street_art',
  redisUrl: process.env.REDIS_URL ?? 'redis://redis:6379',
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:3000',
};

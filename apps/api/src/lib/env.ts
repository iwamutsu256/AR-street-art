const r2AccountId = process.env.R2_ACCOUNT_ID ?? '';

// R2_ENDPOINTが未設定の場合、アカウントIDからS3互換エンドポイントを自動生成
const r2Endpoint = r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : '';

export const env = {
  apiPort: Number(process.env.API_PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@postgres:5432/street_art',
  redisUrl: process.env.REDIS_URL ?? 'redis://redis:6379',
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:3000',
  awsAccessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  awsSecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  r2AccountId: r2AccountId,
  r2BucketName: process.env.R2_BUCKET ?? '',
  r2Endpoint: process.env.R2_ENDPOINT ?? r2Endpoint,
};

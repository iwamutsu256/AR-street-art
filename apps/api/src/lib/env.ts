export const env = {
  apiPort: Number(process.env.API_PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@postgres:5432/street_art',
  redisUrl: process.env.REDIS_URL ?? 'redis://redis:6379',
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:3000',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  r2AccountId: process.env.R2_ACCOUNT_ID ?? '',
  r2BucketName: process.env.R2_BUCKET_NAME ?? '',
  r2Endpoint: process.env.R2_ENTPOINT ?? '',
};

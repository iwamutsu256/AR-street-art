# Street Art Monorepo

## 起動

1. `.env.example` を `.env` にコピー
2. `docker compose up --build`
3. `http://localhost:3000` を開く

## 起動確認できるもの

- Next.js フロント画面
- Hono API の health 表示
- Postgres 初期データから取得した壁一覧
- Redis 接続確認

## 主要 URL

- Frontend: `http://localhost:3000`
- API health: `http://localhost:3000/api/health`
- API walls: `http://localhost:3000/api/walls`

## 補足

- PostgreSQL は PostGIS イメージを使用
- Redis は開発中は非永続
- 壁の seed は `infra/docker/postgres/init/001-init.sql`
- Drizzle 設定は `apps/api/drizzle.config.ts`
- 画像処理、R2、本格的な MapLibre 初期化は次段階

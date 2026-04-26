# AR-street-art

Street Art 開発用モノレポです。

## 起動

1. `.env.example` を `.env` にコピー
2. `docker compose up --build`
3. 別ターミナルで `pnpm db:migrate`
4. 別ターミナルで `pnpm db:seed`
5. `http://localhost:3000` を開く

## 起動確認できるもの

- Next.js フロント画面
- Hono API の health 表示
- seed で投入した壁一覧
- Redis 接続確認

## 主要 URL

- Frontend: `http://localhost:3000`
- API health: `http://localhost:3000/api/health`
- API walls: `http://localhost:3000/api/walls`

## Devcontainer / Codex

- `workspace` サービスでは `codex` の認証情報を `codex_config` volume に保存するため、devcontainer を rebuild しても通常は再ログイン不要です
- 認証状態を消したい場合は `docker compose down -v` を実行するか、`codex_config` volume を削除してください

## 補足

- PostgreSQL は PostGIS イメージを使用
- Redis は開発中は非永続
- `infra/docker/postgres/init/001-init.sql` は PostGIS 拡張の初期化専用
- 壁データの seed は `apps/api/src/db/seed.ts`
- `pnpm db:seed` は実行時に件数を表示するので、投入/スキップを確認できます
- Drizzle 設定は `apps/api/drizzle.config.ts`
- 画像処理、R2、本格的な MapLibre 初期化は次段階

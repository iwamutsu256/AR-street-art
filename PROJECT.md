# Project Handoff

## Project overview

オンラインでストリートアートを作れるサービスを開発しています。
街中のシャッター等を撮影してキャンバスを作成し、複数人が同時にピクセルアートを書き込める Web アプリです。

主な機能:

- 壁面ごとのキャンバス管理
- 複数人同時編集（r/place ライク）
- ピクセルアート前提
- 固定パレット（32〜64色程度）
- AR 表示機能
  - AR カメラを開いた時点のキャンバス状態を使う
  - AR 中は編集しない
- 壁面マップ
  - 現在地に近い壁を表示
  - 各壁には名前と写真がある
  - ルート案内はアプリ内実装しない
  - Google Maps 等の外部地図サービスに遷移させる

## Current technical decisions

### Frontend

- Next.js 16
- TypeScript
- App Router
- MapLibre GL JS
- MapTiler
- frontend は API を `/api` proxy 経由で叩く方針
- `/ws` も将来的に frontend 側から proxy 的に見せたい

### Backend

- Hono
- TypeScript
- REST + WebSocket
- Express ではなく Hono 採用
- API と realtime は将来分離可能な設計にしたいが、現時点では同一 api コンテナ内

### Database / infra

- PostgreSQL + PostGIS
- Redis
- Cloudflare R2
- Docker Compose
- pnpm workspace monorepo
- Drizzle ORM / drizzle-kit
- migration は generate/migrate 運用を継続
- migration SQL / journal は git 管理する
- seed は `seed.ts` で管理する

### Repository structure

- monorepo
- `apps/frontend`
- `apps/api`
- `packages/shared`
- `.devcontainer`
- `docker-compose.yml`

## Important architecture decisions

### Canvas save format

PNG8 を正本にはしません。
正本は固定パレットの色番号配列です。

方針:

- 正本: 1 byte / pixel のパレット index 配列
- DB 保存: `pixel_data` に保存
- PNG は派生物として生成
- リアルタイム更新時は `x, y, colorIndex` を配信する

理由:

- 1px 更新に強い
- リアルタイム同期しやすい
- PNG の encode / decode 往復を避けたい

### Map feature

- MapLibre + MapTiler 採用
- 現在地と壁情報を表示
- 壁をタップしたら外部地図サービスへ遷移
- アプリ内でルート案内は実装しない

### Wall recognition / AR

- 位置情報だけで壁の完全自動認識はしない
- 位置情報は候補絞り込みに使う
- 最終確定は画像ターゲット or 手動確認を残す想定
- ハッカソン段階では AR は「開始時点の固定画像を壁に重ねる」方向
- 高精度な完全自動追跡は後回し

## Current project state

現在は runnable scaffold 段階です。
最低限以下が動く状態を目指しています / 一部は既に雛形ありです。

- Docker Compose で起動
- Next.js frontend が表示される
- Hono API が動く
- Postgres / Redis に接続できる
- 壁一覧取得 API
- health API
- PostGIS 拡張あり
- seed によるデモ壁データ投入
- frontend で health と壁一覧を表示する最小画面

## Current files / assumptions

現時点の主要前提:

- `docker-compose.yml`
- `.env.example`
- `apps/frontend/Dockerfile`
- `apps/api/Dockerfile`
- `apps/api/src/db/schema.ts`
- `apps/api/src/db/seed.ts`
- `apps/api/drizzle.config.ts`
- `packages/shared/src/index.ts`

## Database management policy

重要:

- `init.sql` はインフラ初期化用途に限定する
- アプリテーブル作成の正本は Drizzle migration
- 今後は schema 変更を `schema.ts` → `db:generate` → `db:migrate` で行う
- seed は `seed.ts`
- generated migration files は gitignore にしない
- migration はチーム全員で共有する

## Development policy

- 技術判断は「ハッカソンで確実に動くこと」を優先
- ただし将来の分離余地は残す
- 今は nginx / worker / dedicated realtime container は入れない
- api 内に画像処理を同居させる
- Redis は非永続でもよい
- Postgres は volume 永続化
- frontend / api は bind mount
- node_modules はコンテナ側で管理

## What I want you to do

このプロジェクトに対して、以下を優先して支援してください。

1. 現在のコードベースを読んで、実際にどこまで動くか確認
2. Docker Compose, frontend, api, drizzle 周りの不整合があれば直す
3. migration / seed / schema 管理を破綻しないように整理
4. frontend の API proxy と最小画面を安定化
5. MapLibre + MapTiler の初期表示を追加
6. 壁一覧 API と壁詳細 API の整備
7. 今後の realtime canvas 実装に向けた土台整理
8. 変更はできるだけ小さく分け、理由を説明すること

## Constraints

- 4人チーム開発
- 初学者が含まれるので、複雑化しすぎないこと
- migration 管理は継続
- Docker / VS Code / devcontainer で扱いやすいこと
- なるべく「何を変更したか」が追いやすいこと

## If you need to refactor

以下は refactor してよいです。

- Dockerfile の依存解決
- workspace 周りの詰まりどころ
- drizzle 周辺の構成
- frontend の fetch 周り
- shared package の解決
- seed の drizzle insert 化

以下は勝手に大きく変えないでください。

- Hono 採用
- MapLibre + MapTiler 採用
- PostgreSQL + PostGIS
- Redis
- Cloudflare R2
- monorepo 方針
- migration を git 管理する方針

## Desired output style

- まず現状分析
- 次に問題点一覧
- その後、最小修正案
- 修正内容はファイルごとに示す
- 必要ならコマンドも明記

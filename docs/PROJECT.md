# Project Handoff

## Overview

オンラインでストリートアートを作れるサービスです。
街中の壁やシャッターを撮影してキャンバスを作り、複数人が同時にピクセルアートを書き込める Web アプリとして実装を進めています。

現在のコードベースは、壁登録、壁詳細、canvas editor、WebSocket realtime、実験的 AR 表示までの最小導線を持っています。

## Tech Stack

- Monorepo: pnpm workspace
- Frontend: Next.js 16、React 19、TypeScript、App Router
- API: Hono、`@hono/node-server`
- Realtime: `ws`
- DB: PostgreSQL 17 + PostGIS image
- ORM / migration: Drizzle
- Cache / realtime working state: Redis 8
- Object storage: Cloudflare R2 via S3 compatible API
- Image processing: frontend browser canvas、API `sharp`
- AR: A-Frame + MindAR image tracking
- Local dev: Docker Compose

## Current Implementation Snapshot

scaffold 段階を越えて「壁登録からリアルタイム編集と AR prototype までの導線」が動く状態です。

### Frontend

- Next.js 16 / TypeScript / App Router
- ホーム画面
  - `health` の表示
  - 壁一覧の表示
  - 各壁詳細への遷移
- 壁マップ画面
  - `/map`
  - 表示中の地図範囲にある壁を pin 表示
  - pin 選択時に壁詳細を取得し、書き込み / AR 導線を表示
- 壁登録画面
  - 画像アップロード
  - 四隅編集
  - rectified 生成
  - キャンバスサイズ決定
  - 緯度 / 経度入力
  - `LocationPicker` は `.env` の `NEXT_PUBLIC_MAPTILER_KEY` を使って MapLibre + MapTiler の地図を表示
- 壁詳細画面
  - 画像プレビュー
  - キャンバス情報表示
  - 編集画面への遷移
  - AR 画面への遷移
- キャンバス編集画面
  - 32 色固定パレット + transparent
  - リアルタイム同期
  - 参照用 rectified 背景
  - 方眼表示
  - ホバーセルのハイライト
  - 左ドラッグで描画
  - middle button / 右ドラッグ / `Space` + ドラッグでパン
  - カーソル位置基準のホイールズーム
  - 右サイドバーのナビゲータから表示位置移動
- AR 画面
  - wall と canvas snapshot を読み込み
  - rectified image を MindAR target として runtime compile
  - 現在の canvas snapshot を artwork image として重ねる
- 近傍壁バナー
  - browser geolocation で 30m 以内の壁を検出
  - 現在のリンク先は実装 route とずれているため修正対象
- `/api/proxy-image`
  - AR と画像読み込み用の frontend route handler

### Backend

- Hono ベースの REST API
- `ws` ベースの WebSocket realtime
- `GET /`
- `GET /health`
- `GET /walls`
- `GET /walls/:id`
- `POST /walls`
- `POST /walls/:wallId/canvases`
- `GET /canvases/:canvasId`
- WebSocket `ws/canvases/:canvasId`

### Data / Infra

- PostgreSQL + PostGIS
- Redis
- Cloudflare R2
- Docker Compose
- pnpm workspace monorepo
- Drizzle migration / seed 運用
- `palettes` テーブル実装済み
  - 現在は `v1` の 32 色固定パレットのみ

## Architecture Decisions That Are Already Reflected In Code

### Canvas Source of Truth

- 正本は 1 byte / pixel の palette value 配列
- `0` は transparent、`1..palette.length` が visible color
- DB では `canvases.pixel_data` に保存
- API / WebSocket では Base64 スナップショット + 差分配信
- realtime 作業領域は Redis
- Redis 上の dirty canvas を一定間隔で DB へ flush

### Realtime Broadcast

- 接続は API process 内の in-memory map で `canvasId` ごとに管理
- 更新は Redis に反映してから同じ canvas の全 client に broadcast
- sender にも broadcast が返る
- 複数 API instance 間の Redis pub/sub fanout は未実装

### Wall Images

- `original`, `thumbnail`, `rectified` の 3 種類を保存
- 画像の正規化は frontend 側
- API には multipart で 3 ファイルを送信
- DB には URL と corner coordinates を保存

### Frontend / API Connection

- REST は `/api` proxy 経由
- WebSocket は `/ws` proxy がまだないため、現状は frontend 側で API ポートへ直接接続する実装
  - Docker Compose 開発環境では実質 `ws://localhost:3001/ws/...`

### AR Prototype

- A-Frame と MindAR scripts を browser で読み込む
- rectified image を image target として runtime compile
- canvas snapshot を PNG data URL に変換して artwork として表示
- 外部画像読み込みには `/api/proxy-image` を使用
- prototype-grade のため、palette value mapping と script loading は本番前に見直しが必要

## What Is Seeded Today

- default palette (`v1`)
- demo wall 2 件
- demo canvas 2 件

## Environment Notes

- API reads `API_PORT`, `APP_ORIGIN`, `DATABASE_URL`, `REDIS_URL`
- API reads R2 credentials from `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `R2_ENDPOINT`
- API currently reads `R2_IMAGE_URL` when constructing public `r2.dev` URLs
- frontend reads `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_WS_BASE`, and `API_PROXY_TARGET`
- frontend reads `NEXT_PUBLIC_MAPTILER_KEY` for the `/walls/new` location map

## Known Issues And Gaps

- 認証
- レート制限
- WebSocket auto reconnect
- 外部地図サービスへの導線
- undo / layers / selection などの高度な描画機能
- palette 管理 UI
- PNG 書き出し
- 複数 API インスタンスを前提にした Redis pub/sub 同期
- AR rendering should be reviewed for palette value mapping and script loading before production use
- Load-test scripts are not currently checked into the repository

## Repository Hotspots

- `apps/frontend/src/components/walls/NewWallForm.tsx`
  - 壁登録 UI の中心
- `apps/frontend/src/components/canvas/CanvasEditor.tsx`
  - 編集画面 UI / interaction の中心
- `apps/frontend/src/lib/wall-image.ts`
  - client-side image validation and generation
- `apps/api/src/index.ts`
  - REST / WebSocket の中心
- `apps/api/src/lib/s3.ts`
  - R2 upload and JPEG conversion
- `apps/api/src/db/schema.ts`
  - DB schema
- `apps/api/src/db/seed.ts`
  - demo data / default palette
- `packages/shared/src/index.ts`
  - frontend / backend の共有型・定数
- `apps/frontend/src/app/ar/[id]/page.tsx`
  - AR data loading and artwork rendering
- `apps/frontend/src/components/ar/ARScene.tsx`
  - MindAR / A-Frame scene setup

## Recommended Next Steps

1. 近傍壁バナーの AR link を `/ar/:id` に直す、または route alias を追加する
2. AR の canvas snapshot rendering を `0 = transparent`, `1..palette.length` の color model に合わせて確認する
3. WebSocket reconnect と user-visible recovery を追加する
4. realtime を複数 API instance 対応に拡張する
5. canvas color normalization、batch update、wall registration validation のテストを追加する
6. 現在の `pixels:set` protocol 向けの k6 load-test script を追加する

# Project Handoff

## Overview

オンラインでストリートアートを作れるサービスです。
街中の壁やシャッターを撮影してキャンバスを作り、複数人が同時にピクセルアートを書き込める Web アプリとして実装を進めています。

## Current Implementation Snapshot

現在のコードベースは、scaffold 段階を越えて「壁登録からリアルタイム編集までの最小導線」が動く状態です。

### Frontend

- Next.js 16 / TypeScript / App Router
- ホーム画面
  - `health` の表示
  - 壁一覧の表示
  - 各壁詳細への遷移
- 壁登録画面
  - 画像アップロード
  - 四隅編集
  - rectified 生成
  - キャンバスサイズ決定
  - MapLibre + MapTiler による位置選択
- 壁詳細画面
  - 画像プレビュー
  - キャンバス情報表示
  - 編集画面への遷移
- キャンバス編集画面
  - 32 色固定パレット
  - リアルタイム同期
  - 参照用 rectified 背景
  - 方眼表示
  - ホバーセルのハイライト
  - 左ドラッグで描画
  - 右ドラッグ / `Space` + ドラッグでパン
  - カーソル位置基準のホイールズーム
  - 右サイドバーのナビゲータから表示位置移動

### Backend

- Hono ベースの REST API
- `ws` ベースの WebSocket realtime
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

- 正本は 1 byte / pixel のパレット index 配列
- DB では `canvases.pixel_data` に保存
- API / WebSocket では Base64 スナップショット + 差分配信
- realtime 作業領域は Redis
- Redis 上の dirty canvas を一定間隔で DB へ flush

### Wall Images

- `original`, `thumbnail`, `rectified` の 3 種類を保存
- 画像の正規化は frontend 側
- API には multipart で 3 ファイルを送信
- DB には URL と corner coordinates を保存

### Frontend / API Connection

- REST は `/api` proxy 経由
- WebSocket は `/ws` proxy がまだないため、現状は frontend 側で API ポートへ直接接続する実装
  - Docker Compose 開発環境では実質 `ws://localhost:3001/ws/...`

## What Is Seeded Today

- default palette (`v1`)
- demo wall 2 件
- demo canvas 2 件

## What Is Not Implemented Yet

- 認証
- AR 表示
- 壁一覧の本格的なマップブラウズ
  - 現在は壁登録画面の位置選択に MapLibre を使用
  - ホームの壁マップはプレースホルダ中心
- 外部地図サービスへの導線
- undo / layers / selection などの高度な描画機能
- palette 管理 UI
- PNG 書き出し
- 複数 API インスタンスを前提にした Redis pub/sub 同期

## Repository Hotspots

- `apps/frontend/src/components/walls/NewWallForm.tsx`
  - 壁登録 UI の中心
- `apps/frontend/src/components/canvas/CanvasEditor.tsx`
  - 編集画面 UI / interaction の中心
- `apps/api/src/index.ts`
  - REST / WebSocket の中心
- `apps/api/src/db/schema.ts`
  - DB schema
- `apps/api/src/db/seed.ts`
  - demo data / default palette
- `packages/shared/src/index.ts`
  - frontend / backend の共有型・定数

## Recommended Next Steps

1. 壁一覧のマップ表示を本実装に置き換える
2. `/ws` の reverse proxy を整えて接続先の扱いを単純化する
3. リアルタイム同期を複数 API インスタンス対応に拡張する
4. AR 表示の最小プロトタイプを追加する
5. 描画 UX の仕上げ
   - スポイト
   - 直線 / 塗りつぶし
   - ショートカット

# Canvas

## Current Data Model

現在の実装では、キャンバス本体とパレット定義を次のように扱っています。

```ts
export const palettes = pgTable('palettes', {
  version: text('version').primaryKey(),
  name: text('name').notNull(),
  colors: jsonb('colors').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const canvases = pgTable('canvases', {
  id: text('id').primaryKey(),
  wallId: text('wall_id')
    .notNull()
    .references(() => walls.id, { onDelete: 'cascade' }),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  paletteVersion: text('palette_version').notNull().default('v1'),
  pixelData: bytea('pixel_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### Palette

- `palettes` テーブルは実装済み
- 現在使っているのは `v1` のみ
- 色数は 32 色固定
- editor / API / seed はすべて `v1` 前提

## Current Editor UX

編集画面は `/canvases/:canvasId` で開きます。

### Layout

- 左サイドバー
  - 題名
  - ツール説明
  - 32 色パレット
- 中央
  - ピクセルキャンバス
- 右サイドバー
  - ナビゲータ
  - 接続状態 / サイズ / カーソル座標などの情報
  - 離脱メニュー

### Canvas Presentation

- 薄い方眼表示あり
- ホバー中セルのハイライトあり
- rectified を低 opacity の参照背景として表示
- 右上ナビゲータにも同じ参照背景を表示
- ナビゲータには現在の表示範囲をボーダー表示

### Current Interaction

- 左ドラッグ: 描画
- 右ドラッグ: パン
- `Space` + ドラッグ: パン
- ホイール: カーソル位置基準のズーム
- 右上ナビゲータのクリック / ドラッグ: 表示位置の移動

## Communication Model

### Initial Load

1. `GET /canvases/:canvasId` で `canvas:snapshot` を取得
2. その後 `ws/canvases/:canvasId` に接続
3. WebSocket 接続直後にも最新 `canvas:snapshot` が送られる

### Realtime State

- サーバーは Redis を canvas の作業領域として利用
- 編集差分は Redis に即時反映
- dirty な canvas は一定間隔で DB に flush
- 現在の flush 間隔は 5 秒

### Message Format

クライアント → サーバー

```json
{
  "type": "pixel:set",
  "canvasId": "c1",
  "x": 12,
  "y": 7,
  "color": 5
}
```

サーバー → 全クライアント

```json
{
  "type": "pixel:applied",
  "canvasId": "c1",
  "x": 12,
  "y": 7,
  "color": 5
}
```

スナップショット

```json
{
  "type": "canvas:snapshot",
  "canvasId": "c1",
  "wallId": "w1",
  "width": 128,
  "height": 128,
  "paletteVersion": "v1",
  "palette": ["#fff8f0", "..."],
  "pixels": "..."
}
```

### Color Range

- 色 index は `0` から `31`
- `pixels` は Base64 文字列
- 1 pixel = 1 byte の palette index

## What Is Not Implemented Yet

- undo / redo
- レイヤー
- スポイト
- 塗りつぶし
- 直線ツール
- 選択ツール
- palette 切り替え UI
- レート制限 / 認証付き編集
- 複数 API インスタンス間の realtime 同期

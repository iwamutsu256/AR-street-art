# Canvas

この文書は、現在の canvas data model、editor UX、realtime 同期の実装メモです。

関連する主なファイル:

- [apps/api/src/index.ts](/workspace/apps/api/src/index.ts)
- [apps/api/src/db/schema.ts](/workspace/apps/api/src/db/schema.ts)
- [packages/shared/src/index.ts](/workspace/packages/shared/src/index.ts)
- [apps/frontend/src/components/canvas/CanvasEditor.tsx](/workspace/apps/frontend/src/components/canvas/CanvasEditor.tsx)
- [apps/frontend/src/app/canvases/[canvasId]/page.tsx](/workspace/apps/frontend/src/app/canvases/[canvasId]/page.tsx)

## Current Data Model

canvas は PostgreSQL の `canvases` テーブルに保存されます。realtime 編集中の作業領域は Redis です。

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
- editor は 32 色に加えて transparent swatch を表示
- palette 管理 UI と palette 一覧 API は未実装

### Pixel Value

`pixelData` と snapshot の `pixels` は、1 pixel = 1 byte の palette value 配列です。

- `0`: transparent
- `1`: `palette[0]`
- `2`: `palette[1]`
- `32`: `palette[31]`

つまり、現在の default palette では有効値は `0..32` です。範囲外の値は API と editor の両方で `0` に正規化します。

### Canvas Size

- `CANVAS_MAX_SIZE = 512`
- `DEFAULT_CANVAS_SIZE = 128`
- frontend の壁登録 UI に限り `CANVAS_MIN_SIZE = 32`

API validation は、幅と高さについて「正の整数かつ 512 以下」を見ます。壁登録 UI の slider は長辺を `32..512` で選ばせ、rectified 画像のアスペクト比から短辺を計算します。短辺は極端な縦長や横長の場合に 32 未満になり得ます。

## Current Editor UX

編集画面は `/canvases/:canvasId` で開きます。

### Layout

- 左サイドバー
  - 壁名または `ライブキャンバス`
  - 32 色パレット + transparent
  - 選択中の色表示
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
- middle button / 右ドラッグ: パン
- `Space` + ドラッグ: パン
- ホイール: カーソル位置基準のズーム
- 右上ナビゲータのクリック / ドラッグ: 表示位置の移動
- drag 中の stroke は Bresenham line で補間

専用の直線ツールは未実装です。上記の line 補間は pointer move 間の抜けを埋めるための処理です。

### Zoom

- 初期 zoom は `448 / longestEdge` をもとに `2..12` に丸める
- wheel zoom は `1..24`、0.5 刻み
- pan は canvas が stage より大きい場合のみ有効

## Communication Model

### Initial Load

1. server component が `GET /canvases/:canvasId` で `canvas:snapshot` を取得
2. snapshot の `wallId` から `GET /walls/:id` を呼び、壁名と rectified image URL を取得
3. browser 上の `CanvasEditor` が WebSocket に接続
4. WebSocket 接続直後の snapshot で pixel state と palette を最新化

Next.js の `/ws` rewrite はないため、開発環境では実質 `ws://localhost:3001/ws/canvases/:canvasId` に接続します。

### Realtime State

- サーバーは Redis を canvas の作業領域として利用
- 編集差分は Redis に即時反映
- dirty な canvas は一定間隔で DB に flush
- 現在の flush 間隔は 5 秒
- Redis keys は `canvas:{canvasId}:pixels`、`canvas:{canvasId}:meta`、`canvas:dirty`
- Redis に pixel buffer がなければ DB の `canvases.pixel_data` から読み込み
- DB の byte length が `width * height` と一致しない場合は blank canvas として扱う

### Message Format

クライアント → サーバー。API は単一 pixel と batch の両方を受け付けます。

```json
{
  "type": "pixel:set",
  "canvasId": "c1",
  "x": 12,
  "y": 7,
  "color": 5
}
```

```json
{
  "type": "pixels:set",
  "canvasId": "c1",
  "pixels": [
    { "x": 12, "y": 7, "color": 5 },
    { "x": 13, "y": 7, "color": 5 }
  ]
}
```

現在の editor は描画時に `pixels:set` を送ります。batch size は API validation で最大 500 pixels です。

サーバー → 全クライアント。

```json
{
  "type": "pixel:applied",
  "canvasId": "c1",
  "x": 12,
  "y": 7,
  "color": 5
}
```

```json
{
  "type": "pixels:applied",
  "canvasId": "c1",
  "pixels": [
    { "x": 12, "y": 7, "color": 5 },
    { "x": 13, "y": 7, "color": 5 }
  ]
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
  "pixels": "...",
  "createdAt": "2026-04-17T00:00:00.000Z",
  "updatedAt": "2026-04-17T00:00:00.000Z"
}
```

### Color Range

- `pixels` は Base64 文字列
- 1 pixel = 1 byte の palette value
- `0` は transparent
- `1..palette.length` が palette 色

## What Is Not Implemented Yet

- undo / redo
- レイヤー
- スポイト
- 塗りつぶし
- 直線ツール
- 選択ツール
- palette 切り替え UI
- PNG 書き出し
- レート制限 / 認証付き編集
- 複数 API インスタンス間の realtime 同期
- WebSocket auto reconnect

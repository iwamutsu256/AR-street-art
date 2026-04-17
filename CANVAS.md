# Canvas

## データ

キャンバスのテーブル上でのデータ構造を抜粋する。

```ts
export const canvases = pgTable("canvases", {
  id: text("id").primaryKey(),
  wallId: text("wall_id")
    .notNull()
    .references(() => walls.id, { onDelete: "cascade" }),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  paletteVersion: text("palette_version").notNull().default("v1"),
  pixelData: bytea("pixel_data"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

利用可能な色は32色で、palletesテーブル（未実装）内にHEXのJSON配列で保存する。まずは`default`のみを実装し、すべてのキャンバスに適用する。

## キャンバス編集機能

各壁の詳細に設置した「壁に書き込む」ボタンを押すことで、キャンバスを展開する。
キャンバスはWebSocketを用いて複数人が同時に編集できる。

### 編集画面の詳細

編集画面には、離脱ボタン、カラーピッカーとキャンバスが設置されている。
カラーピッカーには事前に登録された32色があり、ユーザーはその中から選ぶ。
複雑なツールはまずは実装しない。
キャンバスはズーム、移動できる。

### 通信

編集ページを開いた際、APIでキャンバス全体のデータを受け取り、編集画面を構築する。編集が可能になると、WebSocketの接続を開始する。
ユーザーによる編集を受けると、サーバーはRedis上のcanvasの状態を更新し、同じキャンバスを開いているユーザー（編集した本人を含む）に差分を配信する。この通信はリアルタイム性のため、Redis上に保存された情報は、一定間隔でDBに保存する。

#### 通信の例

クライアント→サーバー

```json
{
  "type": "pixel:set",
  "canvasId": "c1",
  "x": 12,
  "y": 7,
  "color": 5
}
```

サーバー→全クライアント

```json
{
  "type": "pixel:applied",
  "canvasId": "c1",
  "x": 12,
  "y": 7,
  "color": 5
}
```

完全データ

```json
{
  "type": "canvas:snapshot",
  "canvasId": "c1",
  "width": 128,
  "height": 128,
  "paletteVersion": 1,
  "pixels": "..."
}
```

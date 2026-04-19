# API / WebSocket

このドキュメントは、現在のコードベースに合わせた Street Art App の REST API、frontend API route、WebSocket realtime 仕様です。

実装の中心は [apps/api/src/index.ts](/workspace/apps/api/src/index.ts) です。ブラウザからの REST 呼び出しは Next.js の rewrite を通して `/api/*` で利用します。

## Base URLs

Docker Compose の開発環境では次の構成です。

- Frontend: `http://localhost:3000`
- Hono API direct: `http://localhost:3001`
- Browser REST: `http://localhost:3000/api/*`
- WebSocket direct: `ws://localhost:3001/ws/canvases/:canvasId`

補足:

- `apps/frontend/next.config.ts` は `/api/:path*` を `API_PROXY_TARGET` へ rewrite します
- `/ws` の Next.js rewrite はありません。editor は API 側 WebSocket URL を組み立てて直接接続します
- API の CORS origin は `APP_ORIGIN` です

## Auth

現時点では認証は未実装です。

## Pixel Values

canvas の pixel は 1 pixel = 1 byte の palette value です。

- `0`: transparent
- `1..palette.length`: palette 色。`1` が `palette[0]` に対応します
- 現在の default palette `v1` は 32 色なので、有効値は `0..32` です
- 範囲外の値は snapshot 生成時や update 処理時に `0` へ正規化されます

---

## 1. Health

### `GET /`

API process の簡易応答です。

**Response 200**

```json
{
  "ok": true,
  "service": "api"
}
```

### `GET /health`

API / DB / Redis の疎通確認を返します。

**Response 200**

```json
{
  "ok": true,
  "db": true,
  "redis": true
}
```

**Response 503**

```json
{
  "ok": false,
  "db": false,
  "redis": true
}
```

---

## 2. Walls API

### `GET /walls`

壁一覧を作成日時の昇順で返します。`photoUrl` は `thumbnailImageUrl` です。

**Response 200**

```json
[
  {
    "id": "string",
    "name": "string",
    "latitude": 35.68,
    "longitude": 139.76,
    "photoUrl": "https://..."
  }
]
```

### `GET /walls/:id`

壁詳細を返します。
関連 canvas があれば、作成日時が最も古い 1 件を `canvas` として同梱します。canvas がない場合は `canvas: null` です。

**Response 200**

```json
{
  "id": "string",
  "name": "string",
  "latitude": 35.68,
  "longitude": 139.76,
  "originalImageUrl": "https://...",
  "thumbnailImageUrl": "https://...",
  "rectifiedImageUrl": "https://...",
  "cornerCoordinates": [
    { "x": 10, "y": 10 },
    { "x": 100, "y": 10 },
    { "x": 100, "y": 100 },
    { "x": 10, "y": 100 }
  ],
  "approxHeading": 180,
  "visibilityRadiusM": 40,
  "createdAt": "2026-04-17T00:00:00.000Z",
  "photoUrl": "https://...",
  "canvas": {
    "id": "string",
    "width": 192,
    "height": 128,
    "paletteVersion": "v1"
  }
}
```

**Response 404**

```json
{
  "message": "Wall not found"
}
```

### `POST /walls`

壁を新規作成します。
現在の実装では、壁作成と同時に blank canvas も 1 つ作成します。画像は API 側で Cloudflare R2 へ保存します。

**Content-Type**

- `multipart/form-data`

**Form Fields**

- `name`: required string
- `latitude`: required number, `-90..90`
- `longitude`: required number, `-180..180`
- `approxHeading`: optional integer, `0..359`
- `visibilityRadiusM`: optional positive integer, default `30`
- `cornerCoordinates`: required JSON string of 4 points
- `originalImageFile`: required non-empty `image/*`
- `thumbnailImageFile`: required non-empty `image/*`
- `rectifiedImageFile`: required non-empty `image/*`
- `canvasWidth`: required positive integer, max `512`
- `canvasHeight`: required positive integer, max `512`

現在の frontend は `approxHeading` と `visibilityRadiusM` を送っていません。そのため、作成される壁は `approxHeading: null`、`visibilityRadiusM: 30` になります。

API 側では受け取った 3 画像を `sharp` で JPEG quality 80 に変換し、次の key で R2 に保存します。

- `walls/:wallId/original.jpeg`
- `walls/:wallId/thumbnail.jpeg`
- `walls/:wallId/wall-rectified.jpeg`

**Response 201**

```json
{
  "id": "string",
  "name": "string",
  "latitude": 35.68,
  "longitude": 139.76,
  "originalImageUrl": "https://...",
  "thumbnailImageUrl": "https://...",
  "rectifiedImageUrl": "https://...",
  "cornerCoordinates": [
    { "x": 10, "y": 10 },
    { "x": 100, "y": 10 },
    { "x": 100, "y": 100 },
    { "x": 10, "y": 100 }
  ],
  "approxHeading": null,
  "visibilityRadiusM": 30,
  "createdAt": "2026-04-17T00:00:00.000Z",
  "photoUrl": "https://...",
  "canvas": {
    "id": "string",
    "width": 192,
    "height": 128,
    "paletteVersion": "v1"
  },
  "message": "Wall created successfully"
}
```

**Response 400**

```json
{
  "errors": [
    {
      "path": ["name"],
      "message": "name is required"
    }
  ]
}
```

**Response 500**

```json
{
  "message": "Failed to create wall: ..."
}
```

---

## 3. Canvases API

### `POST /walls/:wallId/canvases`

指定した壁に canvas を追加作成します。
通常のユーザーフローでは `POST /walls` の自動作成 canvas を使いますが、この endpoint 自体は残っています。

**Request Body**

```json
{
  "width": 192,
  "height": 128,
  "paletteVersion": "v1"
}
```

`paletteVersion` は省略可能で、default は `v1` です。

**Response 201**

```json
{
  "id": "string",
  "wallId": "string",
  "width": 192,
  "height": 128,
  "paletteVersion": "v1",
  "createdAt": "2026-04-17T00:00:00.000Z",
  "updatedAt": "2026-04-17T00:00:00.000Z",
  "message": "canvas created successfully"
}
```

**Response 400**

```json
{
  "message": "palette not found"
}
```

または

```json
{
  "errors": [
    {
      "path": ["width"],
      "message": "max width is 512"
    }
  ]
}
```

**Response 404**

```json
{
  "message": "wall not found"
}
```

### `GET /canvases/:canvasId`

現在の canvas 全体スナップショットを返します。
この形は editor の初期ロードと WebSocket 接続直後の snapshot と揃えています。

**Response 200**

```json
{
  "type": "canvas:snapshot",
  "canvasId": "string",
  "wallId": "string",
  "width": 192,
  "height": 128,
  "paletteVersion": "v1",
  "palette": ["#fff8f0", "..."],
  "pixels": "BASE64_STRING",
  "createdAt": "2026-04-17T00:00:00.000Z",
  "updatedAt": "2026-04-17T00:00:00.000Z"
}
```

**Response 404**

```json
{
  "message": "canvas not found"
}
```

補足:

- `pixels` は Base64 文字列です
- 1 pixel = 1 byte の palette value です
- `0` は transparent、`1` が `palette[0]` に対応します
- 現在の `v1` palette では有効値は `0..32` です

---

## 4. Frontend API Route

### `GET /api/proxy-image?url=...`

Next.js 側の route handler です。AR と画像読み込みで外部画像を same-origin 経由にするために使います。

- `url` query がない場合は `400 Missing url`
- upstream が non-2xx の場合は upstream status
- fetch 例外時は `502 Fetch failed`
- 成功時は upstream の `Content-Type` と `Cache-Control: public, max-age=3600` を返します

---

## 5. WebSocket API

### `GET ws://localhost:3001/ws/canvases/:canvasId`

特定 canvas の realtime 編集用接続です。

接続 path が `/ws/canvases/:canvasId` でない場合、socket は `1008 invalid WebSocket path` で close されます。canvas が見つからない場合は error message を送ってから `1008 canvas not found` で close されます。

### 接続時のサーバーメッセージ

接続直後に、サーバーは最新 snapshot を返します。

```json
{
  "type": "canvas:snapshot",
  "canvasId": "string",
  "wallId": "string",
  "width": 192,
  "height": 128,
  "paletteVersion": "v1",
  "palette": ["#fff8f0", "..."],
  "pixels": "BASE64_STRING",
  "createdAt": "2026-04-17T00:00:00.000Z",
  "updatedAt": "2026-04-17T00:00:00.000Z"
}
```

### Client -> Server: Single Pixel

```json
{
  "type": "pixel:set",
  "canvasId": "string",
  "x": 12,
  "y": 7,
  "color": 5
}
```

ルール:

- `canvasId` は接続先 path の `:canvasId` と一致している必要があります
- `color` は `0` 以上の整数です。範囲外の palette value は `0` に正規化されます
- `x`, `y` は canvas 範囲内

### Server -> Clients: Single Pixel

```json
{
  "type": "pixel:applied",
  "canvasId": "string",
  "x": 12,
  "y": 7,
  "color": 5
}
```

### Client -> Server: Pixel Batch

現在の editor はドラッグ中の stroke を `pixels:set` で送ります。

```json
{
  "type": "pixels:set",
  "canvasId": "string",
  "pixels": [
    { "x": 12, "y": 7, "color": 5 },
    { "x": 13, "y": 7, "color": 5 }
  ]
}
```

ルール:

- `pixels` は 1 件以上、500 件以下です
- `canvasId` は接続先 path の `:canvasId` と一致している必要があります
- 範囲外の座標は batch 内で silently dropped されます
- 有効な pixel が 0 件になった場合、broadcast は行われません
- `color` は single pixel と同じく正規化されます

### Server -> Clients: Pixel Batch

```json
{
  "type": "pixels:applied",
  "canvasId": "string",
  "pixels": [
    { "x": 12, "y": 7, "color": 5 },
    { "x": 13, "y": 7, "color": 5 }
  ]
}
```

補足:

- 更新は同じ canvas を開いている全クライアントに配信されます
- 編集した本人にも配信されます

### Error Messages

**Invalid path**

- socket は `1008 invalid WebSocket path` で close されます

**Invalid message format**

```json
{
  "type": "error",
  "message": "invalid message format",
  "issues": []
}
```

**Canvas mismatch**

```json
{
  "type": "error",
  "message": "canvasId does not match the connected canvas"
}
```

**Canvas not found**

```json
{
  "type": "error",
  "message": "Canvas not found"
}
```

**Out of bounds**

```json
{
  "type": "error",
  "message": "Pixel coordinates out of bounds"
}
```

**Generic error**

```json
{
  "type": "error",
  "message": "Failed to process message"
}
```

**Unknown message type**

```json
{
  "type": "error",
  "message": "unknown message type: ..."
}
```

---

## 6. Runtime Notes

- realtime の作業領域は Redis に置きます
- Redis keys は `canvas:{canvasId}:pixels`、`canvas:{canvasId}:meta`、`canvas:dirty` です
- Redis に pixel data がない場合は DB の `canvases.pixel_data` から復元します
- DB の pixel data が存在しない、またはサイズ不一致の場合は blank buffer として扱います
- dirty canvas は約 5 秒ごとに DB へ flush します
- API shutdown 時も dirty canvas の flush を試みます
- API と realtime は現在同一 `api` コンテナ内です
- broadcast は現在の API process 内の in-memory connection map で行います
- 複数 API instance 間の Redis pub/sub 同期は未実装です
- palette の取得 API はまだなく、snapshot に palette 配列を同梱しています

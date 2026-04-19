# API Documentation

このドキュメントは、現在の実装に合わせた Street Art アプリケーションの API / WebSocket 仕様です。

## Base URLs

Docker Compose の開発環境では次の想定です。

- REST: `http://localhost:3000/api`
- WebSocket: `ws://localhost:3001/ws`

補足:

- frontend は REST を `/api` rewrite 経由で利用します
- `/ws` の frontend proxy はまだないため、現在の editor は API ポートへ直接 WebSocket 接続します

## Auth

現時点では認証は未実装です。

---

## 1. Health

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

壁一覧を返します。

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
現在の実装では、最初の関連 canvas があれば `canvas` も同時に返します。

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
現在の実装では、壁作成と同時に blank canvas も 1 つ作成します。

**Content-Type**

- `multipart/form-data`

**Form Fields**

- `name`: string
- `latitude`: number
- `longitude`: number
- `approxHeading`: number | optional
- `visibilityRadiusM`: number | optional
- `cornerCoordinates`: JSON string of 4 points
- `originalImageFile`: File
- `thumbnailImageFile`: File
- `rectifiedImageFile`: File
- `canvasWidth`: number (`<= 512`)
- `canvasHeight`: number (`<= 512`)

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
  "approxHeading": 180,
  "visibilityRadiusM": 40,
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
- 1 pixel = 1 byte の palette index です
- palette index の範囲は `0` から `31` です

---

## 4. WebSocket API

### `GET ws://localhost:3001/ws/canvases/:canvasId`

特定 canvas の realtime 編集用接続です。

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

### Client -> Server

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
- `color` は `0` から `31`
- `x`, `y` は canvas 範囲内

### Server -> Clients

```json
{
  "type": "pixel:applied",
  "canvasId": "string",
  "x": 12,
  "y": 7,
  "color": 5
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

---

## 5. Runtime Notes

- realtime の作業領域は Redis に置きます
- dirty canvas は約 5 秒ごとに DB へ flush します
- API と realtime は現在同一 `api` コンテナ内です
- palette の取得 API はまだなく、snapshot に palette 配列を同梱しています

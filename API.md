# API Documentation

このドキュメントでは、Street Art アプリケーションのバックエンドAPIエンドポイントについて説明します。

## ベースURL

APIのベースURLは、環境設定によって異なりますが、開発環境では通常 `http://localhost:3000/api` となります。
WebSocket接続は `ws://localhost:3000/ws` を使用します。

## 認証

現時点では、APIエンドポイントに認証は実装されていません。

---

## 1. ヘルスチェック

### `GET /health`

APIサーバー、データベース、Redisの稼働状況を確認するためのエンドポイントです。

#### 目的
システムの健全性を監視します。

#### リクエスト
`GET /health`

#### レスポンス
**成功時 (HTTP 200 OK)**
```json
{
  "ok": true,
  "db": true,
  "redis": true
}
```

**一部またはすべてが失敗時 (HTTP 503 Service Unavailable)**
```json
{
  "ok": false,
  "db": false,
  "redis": true
}
```

---

## 2. 壁 (Walls) API

### `GET /walls`

登録されているすべての壁の概要リストを取得します。

#### 目的
フロントエンドで壁のリストやマップ表示に使用します。

#### リクエスト
`GET /walls`

#### レスポンス
**成功時 (HTTP 200 OK)**
```json
[
  {
    "id": "string",
    "name": "string",
    "latitude": number,
    "longitude": number,
    "photoUrl": "string" // サムネイル画像のURL
  }
]
```

### `GET /walls/:id`

特定の壁の詳細情報を取得します。

#### 目的
特定の壁のAR表示や詳細画面で必要な情報を取得します。

#### リクエスト
`GET /walls/:id`

*   **パスパラメータ**:
    *   `id` (string): 取得する壁のUUID。

#### レスポンス
**成功時 (HTTP 200 OK)**
```json
{
  "id": "string",
  "name": "string",
  "latitude": number,
  "longitude": number,
  "originalImageUrl": "string",
  "thumbnailImageUrl": "string",
  "rectifiedImageUrl": "string",
  "cornerCoordinates": [
    { "x": number, "y": number },
    { "x": number, "y": number },
    { "x": number, "y": number },
    { "x": number, "y": number }
  ],
  "approxHeading": number | null,
  "visibilityRadiusM": number,
  "createdAt": "ISO Date String",
  "photoUrl": "string" // thumbnailImageUrlと同じ
}
```

**壁が見つからない場合 (HTTP 404 Not Found)**
```json
{
  "message": "Wall not found"
}
```

### `POST /walls`

新しい壁を登録します。画像ファイルとメタデータを同時にアップロードします。

#### 目的
ユーザーが新しいストリートアートのキャンバスとなる壁を登録します。

#### リクエスト
`POST /walls`

*   **Content-Type**: `multipart/form-data`
*   **リクエストボディ (Form Data)**:
    *   `name` (string): 壁の名前。必須。
    *   `latitude` (number): 壁の緯度。必須。(-90から90の範囲)
    *   `longitude` (number): 壁の経度。必須。(-180から180の範囲)
    *   `approxHeading` (number, optional): 壁のおおよその向き（方位）。整数 (0-359)。
    *   `visibilityRadiusM` (number, optional): 壁の表示範囲（メートル）。正の整数。デフォルトは30。
    *   `cornerCoordinates` (JSON string): 壁の四隅の座標を表すJSON文字列。`[{"x":10,"y":10}, {"x":100,"y":10}, {"x":100,"y":100}, {"x":10,"y":100}]` の形式で、4つの座標オブジェクトの配列。必須。
    *   `originalImageFile` (File): ユーザーがアップロードした元の画像ファイル。必須。
    *   `thumbnailImageFile` (File): サムネイル画像ファイル。必須。
    *   `rectifiedImageFile` (File): 射影補正された画像ファイル。必須。
    *   `canvasWidth` (number): キャンバスの横幅。必須 (512以下)
    *   `canvasHeight` (number): キャンバスの高さ。必須 (512以下)

#### レスポンス
**成功時 (HTTP 201 Created)**
```json
{
  "id": "string",
  "name": "string",
  "latitude": number,
  "longitude": number,
  "originalImageUrl": "string",
  "thumbnailImageUrl": "string",
  "rectifiedImageUrl": "string",
  "cornerCoordinates": [
    { "x": number, "y": number },
    { "x": number, "y": number },
    { "x": number, "y": number },
    { "x": number, "y": number }
  ],
  "approxHeading": number | null,
  "visibilityRadiusM": number,
  "createdAt": "ISO Date String",
  "message": "Wall created successfully"
}
```

**バリデーションエラー時 (HTTP 400 Bad Request)**
```json
{
  "errors": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["name"],
      "message": "name is required"
    },
    {
      "code": "custom",
      "path": ["originalImageFile"],
      "message": "A non-empty image file is required for originalImageFile."
    }
    // ... その他のバリデーションエラー
  ]
}
```

**サーバーエラー時 (HTTP 500 Internal Server Error)**
```json
{
  "message": "Failed to create wall: Unknown error"
}
```

---

## 3. キャンバス (Canvases) API

### `POST /walls/:wallId/canvases`

指定された壁に新しいキャンバスを作成します。

#### 目的
壁にピクセルアートを描くためのキャンバスを初期化します。

#### リクエスト
`POST /walls/:wallId/canvases`

*   **パスパラメータ**:
    *   `wallId` (string): キャンバスを作成する対象の壁のUUID。
*   **リクエストボディ (JSON)**:
    *   `width` (number): キャンバスの幅（ピクセル単位）。正の整数、最大512。
    *   `height` (number): キャンバスの高さ（ピクセル単位）。正の整数、最大512。
    *   `paletteVersion` (string, optional): 使用するパレットのバージョン。デフォルトは `'v1'`。

#### レスポンス
**成功時 (HTTP 201 Created)**
```json
{
  "id": "string",
  "wallId": "string",
  "width": number,
  "height": number,
  "paletteVersion": "string",
  "createdAt": "ISO Date String",
  "updatedAt": "ISO Date String",
  "message": "canvas created successfully"
}
```

**壁が見つからない場合 (HTTP 404 Not Found)**
```json
{
  "message": "wall not found"
}
```

**バリデーションエラー時 (HTTP 400 Bad Request)**
```json
{
  "errors": [
    {
      "code": "too_big",
      "maximum": 512,
      "type": "number",
      "inclusive": true,
      "exact": false,
      "message": "max width is 512",
      "path": ["width"]
    }
  ]
}
```

### `GET /canvases/:canvasId`

特定のキャンバスの詳細情報とピクセルデータを取得します。

#### 目的
キャンバスの初期状態や現在の状態を読み込み、表示するために使用します。

#### リクエスト
`GET /canvases/:canvasId`

*   **パスパラメータ**:
    *   `canvasId` (string): 取得するキャンバスのUUID。

#### レスポンス
**成功時 (HTTP 200 OK)**
```json
{
  "id": "string",
  "wallId": "string",
  "width": number,
  "height": number,
  "paletteVersion": "string",
  "createdAt": "ISO Date String",
  "updatedAt": "ISO Date String",
  "pixelData": "Base64エンコードされたピクセルデータ文字列"
}
```
`pixelData` は、キャンバスの各ピクセルの色インデックスを格納したバイナリデータ（Buffer）をBase64でエンコードした文字列です。クライアント側でデコードして利用します。

**キャンバスが見つからない場合 (HTTP 404 Not Found)**
```json
{
  "message": "canvas not found"
}
```

---

## 4. WebSocket API (リアルタイムキャンバス編集)

### `ws/canvases/:canvasId`

特定のキャンバスのピクセルデータをリアルタイムで更新し、他のクライアントと同期します。

#### 目的
複数のユーザーが同時にキャンバスを編集し、リアルタイムで変更を共有できるようにします。

#### 接続
`ws://localhost:3000/ws/canvases/:canvasId`

*   **パスパラメータ**:
    *   `canvasId` (string): 接続するキャンバスのUUID。

#### クライアントからサーバーへのメッセージ
クライアントは、ピクセルを更新するために以下のJSON形式のメッセージを送信します。

```json
{
  "type": "pixelUpdate",
  "x": number,       // 更新するピクセルのX座標 (0以上)
  "y": number,       // 更新するピクセルのY座標 (0以上)
  "colorIndex": number // 設定する色のインデックス (0から63の範囲)
}
```

#### サーバーからクライアントへのメッセージ (ブロードキャスト)
ピクセル更新が成功した場合、サーバーは同じキャンバスに接続している他のすべてのクライアントに、以下のJSON形式のメッセージをブロードキャストします。

```json
{
  "type": "pixelUpdate",
  "x": number,
  "y": number,
  "colorIndex": number
}
```

#### エラー処理
*   **無効なWebSocketパス**: 接続は `1008 invalid WebSocket path` コードでクローズされます。
*   **メッセージ形式が無効な場合**: 送信者に対して以下のエラーメッセージが返されます。
    ```json
    {
      "type": "error",
      "message": "invalid message format",
      "issues": [...] // Zodバリデーションエラーの詳細
    }
    ```
*   **キャンバスが見つからない場合**: 送信者に対して以下のエラーメッセージが返されます。
    ```json
    {
      "type": "error",
      "message": "Canvas not found"
    }
    ```
*   **ピクセル座標が範囲外の場合**: 送信者に対して以下のエラーメッセージが返されます。
    ```json
    {
      "type": "error",
      "message": "Pixel coordinates out of bounds"
    }
    ```
*   **その他の処理エラー**: 送信者に対して以下のエラーメッセージが返されます。
    ```json
    {
      "type": "error",
      "message": "Failed to process message"
    }
    ```

#### 動作概要
1.  クライアントは `/ws/canvases/:canvasId` にWebSocket接続を確立します。
2.  クライアントから `pixelUpdate` メッセージを受信すると、サーバーはメッセージをバリデーションし、対象のキャンバスとピクセルデータをデータベースから取得します。
3.  指定された座標と色インデックスでピクセルデータを更新し、データベースに保存します。
4.  データベースへの更新が成功した場合、同じキャンバスに接続している他のすべてのクライアントに更新情報をブロードキャストします。
5.  エラーが発生した場合は、送信者のみにエラーメッセージを返します。
6.  クライアントが切断されると、サーバーは接続リストからそのクライアントを削除します。

---

## 補足

*   `cornerCoordinates` は、画像の四隅の座標を表す配列で、`jsonb` 型としてデータベースに保存されます。
*   `pixelData` は、キャンバスのピクセルごとの色インデックスを格納したバイナリデータで、`bytea` 型としてデータベースに保存されます。APIレスポンスではBase64エンコードされます。
*   画像ファイルはCloudflare R2にアップロードされ、DBにはそのURLが保存されます。

---
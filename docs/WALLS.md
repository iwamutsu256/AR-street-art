# WALLS

この文書は、壁登録、画像処理、壁詳細表示の現在の実装メモです。

関連する主なファイル:

- [apps/frontend/src/components/walls/NewWallRegistrationForm.tsx](/workspace/apps/frontend/src/components/walls/NewWallRegistrationForm.tsx)
- [apps/frontend/src/components/walls/WallScanner.tsx](/workspace/apps/frontend/src/components/walls/WallScanner.tsx)
- [apps/frontend/src/components/walls/CornerEditor.tsx](/workspace/apps/frontend/src/components/walls/CornerEditor.tsx)
- [apps/frontend/src/components/walls/LocationPicker.tsx](/workspace/apps/frontend/src/components/walls/LocationPicker.tsx)
- [apps/frontend/src/lib/wall-image.ts](/workspace/apps/frontend/src/lib/wall-image.ts)
- [apps/frontend/src/lib/walls.ts](/workspace/apps/frontend/src/lib/walls.ts)
- [apps/api/src/lib/s3.ts](/workspace/apps/api/src/lib/s3.ts)

## Current Implementation

壁登録機能は現在実装済みです。
frontend で画像を検証、正規化、rectified 生成し、API に multipart 送信して DB / R2 へ保存します。

API は壁作成時に blank canvas も 1 つ自動作成します。

## Stored Wall Fields

`walls` table の主なフィールド:

- `id`
- `name`
- `latitude`
- `longitude`
- `originalImageUrl`
- `thumbnailImageUrl`
- `rectifiedImageUrl`
- `cornerCoordinates`
- `approxHeading`
- `visibilityRadiusM`
- `createdAt`

現在の登録 UI は `approxHeading` と `visibilityRadiusM` を送信しません。API default により、`approxHeading` は `null`、`visibilityRadiusM` は `30` になります。

## Image Assets

保存する画像は次の 3 種類です。

- `original`
  - 投稿元画像を JPEG 化したもの
  - 長辺 3840px を超える場合は縮小
  - frontend の JPEG quality は `0.88`
- `thumbnail`
  - 800 x 800 の正方形サムネイル
  - 元画像の短辺基準で cover crop
  - frontend の JPEG quality は `0.84`
- `rectified`
  - 4 点指定した壁面を正面化した画像
  - OpenCV ではなく browser canvas 上の bilinear sampling
  - 出力長辺は `min(1920, 元画像の長辺)`
  - frontend の JPEG quality は `0.88`

API 側では、3 画像すべてを `sharp` で JPEG quality 80 に再変換してから R2 に保存します。

R2 object key:

- `walls/:wallId/original.jpeg`
- `walls/:wallId/thumbnail.jpeg`
- `walls/:wallId/wall-rectified.jpeg`

現在の API コードは公開 URL 生成に `R2_IMAGE_URL` を参照します。`.env.example` の R2 URL 系変数を変更する場合は、この名前と合わせる必要があります。

## Current Client-Side Validation

`apps/frontend/src/lib/wall-image.ts` の現在の実装に合わせると、アップロード画像には次の条件があります。

- ファイルサイズは 10MB 以下
- ブラウザで画像として読み込めること
- アスペクト比は 1:3 以上 3:1 以下
- 短辺は 1080px 以上
- 長辺が 3840px を超える場合は保存時に縮小
- 入力は `image/*` として受け付けます。UI 表示上は JPG / PNG / WebP を想定しています
- 出力画像は JPEG

API 側の画像 validation は、各 multipart field が non-empty file であり、`type` が `image/` から始まることだけを見ます。画像サイズ、アスペクト比、短辺の validation は frontend 側の責務です。

## Registration Flow

`/walls/new` は 1 ページ内スクロールではなく、登録方法選択から確認までを step transition で進めます。
各 step に戻る / 次への導線があり、前 step の変更が後 step の rectified、canvas size、送信内容へ反映されます。

### 1. Method Selection

最初に次の 2 つから選択します。

- スキャンで登録
- 画像をアップロードして登録

### 2A. Scan Registration

`WallScanner` が `navigator.mediaDevices.getUserMedia` で environment camera を起動します。
自動 corner / rectangle detection は行わず、撮影画面には次の 3 つだけを表示します。

- 正面から撮影してください
- 四隅を入れてください
- 長方形の壁のみ登録可能です

ユーザーが手動で撮影すると、画像全体より少し内側の default corners を初期値として region confirmation に進みます。
撮影後、`navigator.geolocation.getCurrentPosition` でスキャン完了時の位置を取得し、緯度経度に自動入力します。

### 2B. Upload Registration

壁全体が入り、四隅が見えていて、極端に斜めすぎず、暗すぎない写真をアップロードします。
条件に合わない場合は frontend 側でエラーを表示します。

### 3. Region Confirmation

スキャン画像またはアップロード画像の上に四隅ハンドルを表示し、壁面範囲を手動で調整します。

- 初期位置は画像端より少し内側
- inset は `max(24px, 画像寸法の 8%)`
- 半透明ポリゴンと辺を表示
- ハンドルは画像範囲内に clamp
- drag 中、画面端付近では自動 scroll
- ハンドルを動かした後に rectified を再生成

### 4. Rectified Generation

確定した 4 点から rectified を生成します。
この画像比率をもとに、キャンバスサイズの短辺が自動計算されます。

### 5. Aspect Ratio Adjustment

アップロード登録では、rectified 生成後、canvas size selection の前にアスペクト比調整 step があります。
スライダーで 1:3 から 3:1 の範囲に調整でき、preview はリアルタイムに引き伸ばされます。
次へ進むと、調整後の比率で `rectified-adjusted.jpg` を生成し、以降の canvas size と submit に使います。

### 6. Canvas Size Selection

- スライダーは長辺サイズ
- 範囲は 32px から 512px
- default は 128px
- rectified または adjusted rectified の比率を使って `width` / `height` を決定
- サイズガイドページへのリンクあり

### 7. Name / Location Input

- 壁名は必須
- 緯度は `-90..90`
- 経度は `-180..180`
- スキャン登録では、撮影完了時の位置情報が自動入力されます
- `LocationPicker` component には MapLibre + MapTiler 対応があります
- `/walls/new` は `.env` の `NEXT_PUBLIC_MAPTILER_KEY` を `LocationPicker` に渡します
- `NEXT_PUBLIC_MAPTILER_KEY` が未設定の場合は、地図を表示せず、緯度経度の手入力で登録できます

`LocationPicker` に key が渡された場合は、中央固定 pin、地図移動、現在地取得、IP 概算位置 fallback が使えます。

### 8. Review / Submit

`POST /api/walls` に multipart 送信します。
現在の実装では、壁作成と同時に blank canvas も自動作成されます。

送信 field:

- `name`
- `latitude`
- `longitude`
- `canvasWidth`
- `canvasHeight`
- `cornerCoordinates`
- `originalImageFile`
- `thumbnailImageFile`
- `rectifiedImageFile`

成功時は登録完了 banner に wall 名、canvas size、wall id を表示します。壁詳細と壁一覧へのリンクを表示します。

## Pages That Exist Today

- `/`
  - 壁マップ
  - 表示中の地図範囲にある壁を pin 表示
  - pin 選択時に `GET /api/walls/:id` で詳細を取得し、thumbnail、name、canvas size、canvas 接続人数、書き込み / AR 導線を表示
  - 初期位置は browser current location、MapTiler IP 概算位置、`35.691519, 139.696956` の順に fallback
- `/dev`
  - 開発用ホーム画面
  - health、壁一覧、壁登録、壁マップへの導線を表示
- `/walls/new`
  - 壁登録フロー
- `/walls/[id]`
  - 壁詳細表示
  - rectified / thumbnail の確認
  - キャンバス情報表示
  - 編集画面への導線
  - rectified image がある場合は `/ar/:id` への導線
- `/canvas-size-guide`
  - 登録時の canvas size の目安
- `/ar/[id]`
  - 実験的な AR 表示

## What Is Not Implemented Yet

- OpenCV 等による高精度な自動 corner 推定
- 投稿審査 / モデレーション
- 壁の編集 / 再アップロード UI
- `approxHeading` 入力 UI
- `visibilityRadiusM` 入力 UI
- 画像 upload 失敗後の R2 object cleanup

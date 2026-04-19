# WALLS

この文書は、壁登録、画像処理、壁詳細表示の現在の実装メモです。

関連する主なファイル:

- [apps/frontend/src/components/walls/NewWallForm.tsx](/workspace/apps/frontend/src/components/walls/NewWallForm.tsx)
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

## Registration Flow That Exists Today

### 1. Photo Upload

- 壁全体が入っていること
- 四隅が見えていること
- 極端に斜めでないこと
- 暗すぎないこと

といった注意文を表示しつつ、画像をアップロードします。
条件に合わない場合は frontend 側でエラーを表示します。

### 2. Corner Editing

アップロードした画像の上に四隅ハンドルを表示し、壁面範囲を手動で調整します。

- 初期位置は画像端より少し内側
- inset は `max(24px, 画像寸法の 8%)`
- 半透明ポリゴンと辺を表示
- ハンドルは画像範囲内に clamp
- drag 中、画面端付近では自動 scroll
- ハンドルを動かした後に rectified を再生成

### 3. Rectified Generation

確定した 4 点から rectified を生成します。
この画像比率をもとに、キャンバスサイズの短辺が自動計算されます。

### 4. Canvas Size Selection

- スライダーは長辺サイズ
- 範囲は 32px から 512px
- default は 128px
- Step 2 の rectified 比率を使って `width` / `height` を決定
- サイズガイドページへのリンクあり

### 5. Name / Location Input

- 壁名は必須
- 緯度は `-90..90`
- 経度は `-180..180`
- `LocationPicker` component には MapLibre + MapTiler 対応があります
- ただし現在の `/walls/new` は `mapTilerKey={''}` を渡しているため、地図は表示されず、手入力の緯度経度が実効経路です

`LocationPicker` に key が渡された場合は、中央固定 pin、地図移動、現在地取得、IP 概算位置 fallback が使えます。

### 6. Submit

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

成功時は登録完了 banner に wall 名、canvas size、wall id を表示します。現在の成功 banner は壁詳細への直接リンクではなく、壁一覧へ戻るリンクを表示します。

## Pages That Exist Today

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

- OpenCV 等による自動 corner 推定
- 壁一覧からの外部地図遷移
- 投稿審査 / モデレーション
- 壁の編集 / 再アップロード UI
- `approxHeading` 入力 UI
- `visibilityRadiusM` 入力 UI
- `/walls/new` での MapTiler key wiring
- 壁一覧の本格的な地図ブラウズ
- 画像 upload 失敗後の R2 object cleanup

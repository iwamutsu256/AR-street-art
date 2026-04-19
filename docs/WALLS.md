# WALLS

## Current Implementation

壁登録機能は現在実装済みです。
frontend で画像を加工し、API に multipart 送信して DB / R2 へ保存します。

保存する画像は次の 3 種類です。

- `original`
  - 投稿元画像を JPEG 化したもの
  - 長辺 3840px を超える場合は縮小
- `thumbnail`
  - 800 x 800 の正方形サムネイル
- `rectified`
  - 4 点指定した壁面を射影補正した画像
  - 長辺 1920px を上限に縮小

DB には各画像 URL に加えて、corner coordinates も保存します。

## Current Client-Side Validation

`apps/frontend/src/lib/wall-image.ts` の現在の実装に合わせると、アップロード画像には次の条件があります。

- ファイルサイズは 10MB 以下
- アスペクト比は 1:3 以上 3:1 以下
- 短辺は 1080px 以上
- 長辺が 3840px を超える場合は保存時に縮小
- 出力画像は JPG

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
- 半透明ポリゴンと辺を表示
- ハンドルを動かした後に rectified を再生成

### 3. Rectified Generation

確定した 4 点から rectified を生成します。
この画像比率をもとに、キャンバスサイズの短辺が自動計算されます。

### 4. Canvas Size Selection

- スライダーは長辺サイズ
- 範囲は 32px から 512px
- Step 2 の rectified 比率を使って `width` / `height` を決定
- サイズガイドページへのリンクあり

### 5. Name / Location Input

- 壁名を入力
- MapLibre + MapTiler で位置を指定
- 「現在地へ移動」操作あり

### 6. Submit

`POST /api/walls` に multipart 送信します。
現在の実装では、壁作成と同時に blank canvas も自動作成されます。

## Pages That Exist Today

- `/walls/new`
  - 壁登録フロー
- `/walls/[id]`
  - 壁詳細表示
  - rectified / thumbnail の確認
  - キャンバス情報表示
  - 編集画面への導線

## What Is Not Implemented Yet

- OpenCV 等による自動 corner 推定
- 壁一覧からの外部地図遷移
- 投稿審査 / モデレーション
- 壁の編集 / 再アップロード UI
- 壁一覧の本格的な地図ブラウズ

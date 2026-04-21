# AR

この文書は、現在の AR prototype の実装メモです。

関連する主なファイル:

- [apps/frontend/src/app/ar/[id]/page.tsx](/workspace/apps/frontend/src/app/ar/[id]/page.tsx)
- [apps/frontend/src/components/ar/ARScene.tsx](/workspace/apps/frontend/src/components/ar/ARScene.tsx)
- [apps/frontend/src/components/ar/ScanGuide.tsx](/workspace/apps/frontend/src/components/ar/ScanGuide.tsx)
- [apps/frontend/src/app/api/proxy-image/route.ts](/workspace/apps/frontend/src/app/api/proxy-image/route.ts)
- [apps/frontend/public/mindar-image-aframe.prod.js](/workspace/apps/frontend/public/mindar-image-aframe.prod.js)
- [apps/frontend/src/app/walls/[id]/page.tsx](/workspace/apps/frontend/src/app/walls/[id]/page.tsx)
- [apps/frontend/src/components/NearbyWallBanner.tsx](/workspace/apps/frontend/src/components/NearbyWallBanner.tsx)
- [packages/shared/src/index.ts](/workspace/packages/shared/src/index.ts)

## Overview

現在の AR は、A-Frame + MindAR image tracking による marker based AR を採用しています。

壁登録時に作られた rectified image を image target として使い、カメラ映像内で同じ壁画像を検出できたら、その target 平面上に canvas snapshot 由来の artwork image を重ねます。

特徴:

- AR route は `/ar/:id`
- 1 wall = 1 image target
- `.mind` target file は保存せず、ブラウザ上で毎回 runtime compile する
- A-Frame は CDN から読み込み、MindAR bundle は `public/mindar-image-aframe.prod.js` を読み込む
- 外部画像は `/api/proxy-image` で same-origin 化して読み込む
- canvas の live WebSocket には接続せず、AR 画面を開いた時点の snapshot を表示する

## Entry Points

### 壁詳細

`/walls/:id` の壁詳細画面では、`wall.rectifiedImageUrl` がある場合だけ `AR で見る` link を表示します。リンク先は実装済み route の `/ar/:id` です。

### 近傍壁バナー

`NearbyWallBanner` にも `AR で見る` link がありますが、現在のリンク先は `/walls/:id/ar` です。実装済み route は `/ar/:id` なので、この導線は現状では route mismatch しています。

修正するなら、次のどちらかです。

- `NearbyWallBanner` の link を `/ar/:id` に変更する
- `/walls/:id/ar` を `/ar/:id` に流す route alias を追加する

## Data Loading

AR page 本体は client component の `WallARPage` です。`ARScene` は browser API と A-Frame/MindAR global に依存するため、`dynamic(..., { ssr: false })` で読み込まれます。

ロード順:

1. `useParams()` から `wallId` を取得
2. `GET /api/walls/:wallId` で `WallDetail` を取得
3. `rectifiedImageUrl` がなければ error 表示
4. rectified image を読み込み、`naturalWidth / naturalHeight` から aspect ratio を計算
5. wall に canvas があれば `GET /api/canvases/:canvasId` で `CanvasSnapshot` を取得
6. snapshot が取れた場合は `renderCanvasToDataUrl()` で PNG data URL を生成
7. snapshot が取れない場合、または canvas がない場合は `thumbnailImageUrl`、なければ `rectifiedImageUrl` を artwork として使う
8. `ARScene` に `rectifiedUrl`、`artworkUrl`、`aspectRatio` を渡す

`/api/walls/:id` と `/api/canvases/:id` は Next.js rewrite 経由で API server に流れます。`/api/proxy-image` は Next.js 側の route handler です。

## Snapshot Rendering

`renderCanvasToDataUrl()` は `CanvasSnapshot.pixels` を Base64 decode し、1 byte / pixel の値を `snapshot.palette` に変換して PNG 化します。

現在の実装:

```ts
const hex = snapshot.palette[bytes[i]] ?? "#000000";
imageData.data[i * 4] = parseInt(hex.slice(1, 3), 16);
imageData.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
imageData.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
imageData.data[i * 4 + 3] = 255;
```

注意点:

- canvas data model では `0` が transparent、`1` が `palette[0]`
- 現在の AR rendering は `bytes[i]` をそのまま palette index に使っている
- そのため `0` が transparent ではなく `palette[0]` になり、`1` は `palette[1]` になる
- 全 pixel の alpha を `255` にしているため、transparent pixel は透過されない
- `32` は `palette[32]` が存在しないので `#000000` fallback になる

つまり、現在の AR snapshot rendering は canvas editor の色モデルと 1 つずれています。本番前に `0 = alpha 0`、`1..palette.length = palette[value - 1]` へ直す必要があります。

## AR Runtime

`ARScene` の処理は `startAR()` に集約されています。

### Script Loading

1. `next/script` で `https://aframe.io/releases/1.5.0/aframe.min.js` を読み込む
2. A-Frame の `onLoad` 後に `document.createElement('script')` で `/mindar-image-aframe.prod.js` を追加
3. MindAR script の `onload` で `startAR()` を呼ぶ

`startedRef` により、同じ component instance 内では `startAR()` が二重起動しないようになっています。一方で、MindAR script 自体は mount ごとに append されるため、production では script の重複読み込みを避ける仕組みを入れる余地があります。

### Target Compile

`startAR()` は `window.MINDAR.IMAGE.Compiler` を使って rectified image をその場で image target に compile します。

流れ:

1. `window.MINDAR?.IMAGE` を確認
2. `new cv.Compiler()` を作る
3. rectified image を読み込む
4. `compiler.compileImageTargets([img], progressCallback)` を実行
5. `compiler.exportData()` で target binary を得る
6. `Blob` から object URL を作り、`mindar-image` の `imageTargetSrc` に渡す

画面上の文言では、初回 compile は 10 から 20 秒程度かかる想定です。現状は毎回 runtime compile するため、再訪問時も同じコストが発生します。

### Scene Construction

compile 完了後、`containerRef.current.innerHTML` で A-Frame scene を直接生成します。

主な構成:

- `<a-scene mindar-image="...">`
  - `imageTargetSrc`: runtime compile した object URL
  - `autoStart: true`
  - MindAR 標準の error / scanning UI は非表示
  - `filterMinCF: 0.001`
  - `filterBeta: 0.001`
- `<a-assets>`
  - artwork image を `#artwork-tex` として登録
- `<a-camera>`
  - `look-controls="enabled: false"`
- `<a-entity mindar-image-target="targetIndex: 0">`
  - target 検出時に表示される anchor
- `<a-plane>`
  - `src="#artwork-tex"`
  - rectified image の aspect ratio に合わせた `width` / `height`
  - `material="transparent: true; alphaTest: 0.5;"`

平面サイズは長辺を 1 とした正規化です。

```ts
const planeHeight = aspectRatio >= 1 ? 1 / aspectRatio : 1;
const planeWidth = aspectRatio >= 1 ? 1 : aspectRatio;
```

## UI State

`ARScene` は次の phase を持ちます。

- `loading`: A-Frame / MindAR script 読み込み中
- `compiling`: rectified image から MindAR target を生成中
- `scanning`: target を探している状態
- `found`: target 検出中
- `error`: script、画像、compile などで失敗

`scanning` では `ScanGuide` が表示されます。`targetFound` event で `found`、`targetLost` event で `scanning` に戻ります。`found` の専用 overlay はなく、A-Frame scene の artwork plane が見える状態になります。

error state では message と再試行 button を表示します。再試行 button は `startedRef.current = false` に戻して `startAR()` を再実行します。

## Image Proxy

AR は外部画像を canvas、Image、A-Frame asset として読むため、CORS 回避用に `/api/proxy-image?url=...` を使います。

route handler の挙動:

- `url` query がなければ `400 Missing url`
- upstream が non-2xx なら upstream status で `Upstream error`
- fetch 例外なら `502 Fetch failed`
- 成功時は upstream body を返す
- `Content-Type` は upstream の値を引き継ぐ
- `Cache-Control: public, max-age=3600`
- `Access-Control-Allow-Origin: *`

現在は汎用 proxy なので、production では allowlist、content-type 制限、size 制限、認証や rate limit を検討する必要があります。

## Cleanup

`ARScene` unmount 時には次を実行します。

- runtime compile で作った object URL を `URL.revokeObjectURL()` する
- `document.querySelector('video')` で見つかった video の `MediaStreamTrack` を stop する
- AR scene container の `innerHTML` を空にする

AR page は fullscreen overlay なので実害は小さい想定ですが、cleanup 対象 video の探し方は page 全体から最初の `video` を取る実装です。他の video と共存する画面に載せる場合は、container scope に閉じる方が安全です。

## Browser / Runtime Requirements

- camera permission が必要
- production では HTTPS が必要
- localhost 開発では browser が camera access を許可する
- MindAR image tracking のため、rectified image は特徴点の多い画像ほど安定する
- 単色に近い壁、反射、暗所、強いブレでは tracking が不安定になりやすい

## Technology Requirements / Direction

- 今回利用する AR 技術は A-Frame + MindAR image tracking
- tracking target は壁登録時に作る rectified image
- 将来 AR runtime の技術を変える場合は、A-Frame 依存部分を MindAR 側がアクティブに取り組んでいる Three.js 構成へ移行する方向で検討する

## Current Limitations

- `.mind` file を保存していないため、AR page を開くたびに compile する
- 1 scene 1 target のみ
- AR 表示中に canvas の realtime update は反映されない
- canvas snapshot rendering に transparent / palette offset の不整合がある
- 近傍壁バナーの link が実装 route とずれている
- A-Frame は CDN 依存
- MindAR script の重複 append を避ける仕組みは未実装
- `aframeReady` state は設定されているが、現在の rendering では使われていない
- `/api/proxy-image` は production 向けの URL 制限や size 制限をまだ持たない

## Recommended Next Steps

1. `renderCanvasToDataUrl()` を canvas color model に合わせる
2. `NearbyWallBanner` の AR link を `/ar/:id` に直す、または route alias を追加する
3. `.mind` target を生成済み asset として保存し、runtime compile を避ける
4. AR 表示中に最新 snapshot を再取得する、または WebSocket で artwork texture を更新する
5. A-Frame / MindAR script loader を idempotent にする
6. `/api/proxy-image` に allowlist、content-type、size、timeout の制限を追加する
7. 将来 runtime を変える必要が出たら、A-Frame 依存部分の Three.js 移行を検討する
8. 実機で camera permission、tracking 安定性、透明 pixel、route 導線を確認する

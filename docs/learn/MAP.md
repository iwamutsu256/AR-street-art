# WallMap Learn Notes

`WallMap` の微調整に入るときの実装メモです。地図ライブラリ、主要 props、MapLibre / MapTiler に渡している値、現在地や marker の扱いを実コード基準でまとめています。

## 関連ファイル

- `apps/frontend/src/components/walls/WallMap.tsx`
  - 壁マップ本体。MapLibre の初期化、壁 marker、現在地 marker、詳細 panel を管理します。
- `apps/frontend/src/app/page.tsx`
  - `/` の地図ページ。`NEXT_PUBLIC_MAPTILER_KEY` を `WallMap` に渡します。
- `apps/frontend/src/app/layout.tsx`
  - `maplibre-gl/dist/maplibre-gl.css` を global import します。
- `apps/frontend/src/app/globals.css`
  - `.page-shell--map`、`.wall-map*`、`.wall-map-pin*`、`.wall-map-detail*` の見た目を定義します。
- `packages/shared/src/index.ts`
  - `WallSummary` / `WallDetail` / `CanvasSummary` の共有型を定義します。
- `apps/api/src/routes/walls.ts`
  - `GET /walls`、`GET /walls/:id`、`GET /walls/nearest` のレスポンスを作ります。
- `apps/frontend/src/components/walls/LocationPicker.tsx`
  - 壁登録用の地図 picker。`WallMap` と同じ MapLibre + MapTiler 構成を使います。
- `apps/frontend/src/hooks/useNearbyWalls.ts`
  - 30m 以内の壁を検出する hook。`NearbyWallBanner` で使われます。`/` では banner は非表示です。

## 使用ライブラリ

### `maplibre-gl`

- `apps/frontend/package.json`: `^5.9.0`
- `pnpm-lock.yaml`: `5.23.0`
- 用途:
  - `new maplibregl.Map(...)`
  - `new maplibregl.NavigationControl(...)`
  - `new maplibregl.Marker(...)`
  - `map.getBounds()` / `bounds.contains(...)`
  - `map.flyTo(...)`
  - `map.resize()` / `map.remove()`

公式ドキュメント:

- MapLibre GL JS: <https://maplibre.org/maplibre-gl-js/docs/>
- `Map`: <https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/>
- `MapOptions`: <https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/>
- `Marker`: <https://maplibre.org/maplibre-gl-js/docs/API/classes/Marker/>
- `NavigationControl`: <https://maplibre.org/maplibre-gl-js/docs/API/classes/NavigationControl/>
- `NavigationControlOptions`: <https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/NavigationControlOptions/>

### MapTiler Cloud

`WallMap` は MapTiler の style JSON と IP geolocation API を直接呼びます。

- Style JSON:
  - `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`
- IP geolocation:
  - `https://api.maptiler.com/geolocation/ip.json?key=${mapTilerKey}`

公式ドキュメント:

- Maps API: <https://docs.maptiler.com/cloud/api/maps/>
- Geolocation API: <https://docs.maptiler.com/cloud/api/geolocation/>

### Browser Geolocation API

`WallMap` は browser の現在地を初期表示と現在地 marker 更新に使います。

- 初期取得: `navigator.geolocation.getCurrentPosition(...)`
- 継続監視: `navigator.geolocation.watchPosition(...)`
- 解除: `navigator.geolocation.clearWatch(watchId)`

公式ドキュメント:

- `getCurrentPosition`: <https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition>
- `watchPosition`: <https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition>

### React / Next.js

- `WallMap` は client component です。ファイル先頭に `'use client'` があります。
- `useEffectEvent` を使い、MapLibre の event handler から最新の state / ref にアクセスします。
- `NEXT_PUBLIC_MAPTILER_KEY` は browser 側に公開される環境変数として page component から渡します。

公式ドキュメント:

- React `useEffectEvent`: <https://react.dev/reference/react/useEffectEvent>
- Next.js Environment Variables: <https://nextjs.org/docs/pages/guides/environment-variables>

## `WallMap` props

```ts
type WallMapProps = {
  mapTilerKey: string;
};
```

現在の public API は `mapTilerKey` のみです。

- `mapTilerKey` が空文字の場合:
  - MapLibre を初期化しません。
  - `NEXT_PUBLIC_MAPTILER_KEY` 設定案内の empty state を表示します。
- `mapTilerKey` がある場合:
  - 初期表示位置を解決します。
  - `/api/walls` から壁一覧を取得します。
  - MapTiler style JSON を使って MapLibre map を作成します。

呼び出し元:

```tsx
const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

return <WallMap mapTilerKey={mapTilerKey} />;
```

`/` が地図ページの呼び出し元です。

## 位置とズーム

```ts
const DEFAULT_CENTER = {
  latitude: 35.691519,
  longitude: 139.696956,
};

const LOCATION_JUMP_ZOOM = 8;
const INITIAL_REGION_ZOOM = 7;
```

初期表示は次の順で決まります。

1. Browser geolocation
   - `enableHighAccuracy: true`
   - `maximumAge: 5_000`
   - `timeout: 10_000`
   - 成功時は `userLocation` をセットし、`source: 'browser'`、`zoom: 8` で開始します。
2. MapTiler IP geolocation
   - Browser geolocation が失敗した場合の fallback です。
   - 成功時は `source: 'ip'`、`zoom: 8` で開始します。
   - `userLocation` はセットしません。
3. Default center
   - Browser / IP の両方が失敗した場合の fallback です。
   - `source: 'default'`、`zoom: 7` で開始します。

座標は `formatCoordinate` を通し、数値化してから state に入れます。

## MapLibre 初期化

`initialView` が解決され、`containerRef.current` と `mapTilerKey` がある場合だけ map を作成します。

```ts
const map = new maplibregl.Map({
  center: [initialView.center.longitude, initialView.center.latitude],
  container: containerRef.current,
  style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`,
  zoom: initialView.zoom,
});
```

MapLibre の座標順は `[longitude, latitude]` です。共有型や local state は `{ latitude, longitude }` なので、MapLibre に渡す直前で順番を入れ替えます。

追加している control:

```ts
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
```

登録している map event:

- `load`
  - `mapError` を消します。
  - `mapReady` を `true` にします。
  - `map.resize()` を呼びます。
  - 表示範囲内の壁 marker を同期します。
- `moveend`
  - pan / zoom 後に表示範囲内の壁 marker を同期します。
- `error`
  - `地図タイルを読み込めませんでした。` を toast 表示します。

cleanup:

- wall marker を全削除します。
- user location marker を削除します。
- `map.remove()` で MapLibre instance を破棄します。
- `mapReady` を `false` に戻します。

## 壁データ取得

壁一覧:

```ts
const response = await fetch('/api/walls', { signal: controller.signal });
const walls = (await response.json()) as WallSummary[];
```

`WallSummary`:

```ts
type WallSummary = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  photoUrl?: string | null;
};
```

API の `GET /walls` は現在 `displayAddress` も返しますが、`WallMap` では使っていません。

壁詳細:

```ts
const response = await fetch(`/api/walls/${encodeURIComponent(wall.id)}`);
const detail = (await response.json()) as WallDetail;
```

詳細取得では `detailRequestRef` を request id として使い、古いレスポンスで新しい選択状態を上書きしないようにしています。

`WallDetail` の主な使用箇所:

- `thumbnailImageUrl` / `photoUrl`
  - bottom detail panel の画像
- `name`
  - bottom detail panel のタイトル
- `canvas.width` / `canvas.height`
  - canvas size 表示
- `canvas.activeConnectionCount`
  - 接続人数表示
- `canvas.id`
  - `/canvases/:canvasId` への導線
- `rectifiedImageUrl`
  - `/ar/:wallId` 導線を有効化する条件

注意: 共有型 `CanvasSummary` は `activeConnectionCount` を要求しますが、現行の `apps/api/src/routes/walls.ts` の `GET /walls/:id` は canvas selection で `id` / `width` / `height` / `paletteVersion` のみを返しています。接続人数表示を正しく出す場合は API と型の整合を確認してください。

## Marker 同期

壁 marker は MapLibre layer/source ではなく DOM element を使った `maplibregl.Marker` です。

表示範囲同期:

```ts
const bounds = map.getBounds();
const visibleWalls = wallsRef.current.filter((wall) =>
  bounds.contains([wall.longitude, wall.latitude])
);
```

同期処理:

- `wallsRef` に壁一覧を保持します。
- `markersRef` に `wall.id -> maplibregl.Marker` を保持します。
- `moveend` または壁一覧取得後に `syncVisibleWallMarkers()` を呼びます。
- 表示範囲外に出た marker は `marker.remove()` して `markersRef` から消します。
- 表示範囲内に入った marker は新規作成して map に追加します。

壁 marker の DOM:

```html
<button class="wall-map-pin" aria-label="{wall.name} の詳細を表示">
  <span class="wall-map-pin__dot"></span>
</button>
```

MapLibre marker option:

```ts
new maplibregl.Marker({
  anchor: 'bottom',
  element,
})
```

選択中 marker:

- `selectedWallIdRef.current` と `selectedSummary?.id` を使います。
- marker element に `.is-selected` を toggle します。
- 見た目は `.wall-map-pin.is-selected .wall-map-pin__dot` で変わります。

現在地 marker:

- Browser geolocation 成功時だけ `userLocation` が入ります。
- 初期表示が `source: 'browser'` の場合だけ `watchPosition` を開始します。
- DOM は `.wall-map-user-dot` です。
- `userLocation` が更新されるたびに `setLngLat([longitude, latitude])` します。

## UI / CSS

地図の高さ:

- `.page-shell--map`
  - desktop: `height: calc(100dvh - var(--header-height))`
  - mobile: `height: calc(100dvh - var(--header-height) - var(--mobile-bottom-nav-space))`
- `.wall-map`
  - `height: 100%`
  - `min-height: 540px`
  - mobile: `min-height: 460px`

MapLibre canvas:

- `.wall-map__canvas`
  - `position: absolute`
  - `inset: 0`

独自 control:

- `.wall-map__controls`
  - desktop: `top: 14px; right: 58px`
  - mobile: `top: 10px; right: 54px`
  - MapLibre の zoom control が `top-right` にいるため、現在地 button は少し左にずらしています。

toast:

- `.wall-map__toast`
  - map tile error
- `.wall-map__toast--below`
  - wall fetch error

bottom detail panel:

- `.wall-map-detail`
  - 初期状態は下に隠れています。
  - `.is-open` で `transform: translateY(0)` になります。
- `.wall-map-detail__inner`
  - desktop は `thumbnail / body / actions` の 3 カラムです。
  - mobile は 2 カラムになり、actions は下段に回ります。

## 調整時のチェックポイント

- MapLibre に渡す座標は必ず `[longitude, latitude]` にする。
- CSS で map container の実高さがなくなると地図が見えないため、`.page-shell--map` と `.wall-map` を一緒に確認する。
- `map.resize()` は `load` 時に呼んでいる。親 container の表示方法を変えた場合は、追加で resize が必要になることがあります。
- marker が多くなる場合、現在の DOM marker 方式は数が増えるほど重くなります。大量表示に寄せるなら GeoJSON source + layer への移行を検討します。
- `syncVisibleWallMarkers()` は `moveend` でのみ走ります。drag 中に marker を出し入れしたい場合は `move` も候補ですが、呼び出し頻度が上がります。
- 現在地 button は `userLocation` がないと disabled です。IP fallback だけでは有効になりません。
- Browser geolocation は HTTPS / localhost など secure context が必要です。権限拒否時は IP fallback または default center になります。
- `NearbyWallBanner` は `/` では表示しない実装です。地図画面上に近傍通知を出す場合は、この条件も見直します。

## よく触る調整先

- 初期表示位置
  - `DEFAULT_CENTER`
  - `LOCATION_JUMP_ZOOM`
  - `INITIAL_REGION_ZOOM`
- 地図スタイル
  - MapTiler style URL の `streets-v2`
- zoom control
  - `NavigationControl({ showCompass: false })`
- 現在地取得
  - `getBrowserLocation()`
  - `getApproximateIpLocation(mapTilerKey)`
  - `watchPosition` の options
- marker の見た目
  - `createWallMarkerElement`
  - `.wall-map-pin`
  - `.wall-map-pin__dot`
  - `.wall-map-pin.is-selected`
  - `.wall-map-user-dot`
- bottom panel
  - `detailImageUrl`
  - `selectedCanvas`
  - `.wall-map-detail*`
- API payload
  - `WallSummary`
  - `WallDetail`
  - `GET /walls`
  - `GET /walls/:id`

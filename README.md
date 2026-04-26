# AR-street-art

Street Art 開発用モノレポです。

## 起動

1. `.env.example` を `.env` にコピー
2. `docker compose up --build`
3. 別ターミナルで `pnpm db:migrate`
4. 別ターミナルで `pnpm db:seed`
5. `http://localhost:3000` を開く

## 起動確認できるもの

- Next.js フロント画面
- Hono API の health 表示
- seed で投入した壁一覧
- Redis 接続確認

## 主要 URL

- Frontend: `http://localhost:3000`
- API health: `http://localhost:3000/api/health`
- API walls: `http://localhost:3000/api/walls`

## スマホ実機を LAN で試すときの HTTPS

位置情報とカメラは `http://<LANのIP>:3000` では利用できないため、LAN テスト時は HTTPS で起動してください。

1. `.env` の `FRONTEND_DEV_HTTPS=1` に変更
2. `.env` の `FRONTEND_DEV_HOST` を、スマホから開くホスト名に変更
3. Docker 利用時は `docker compose up --build --force-recreate frontend api`
4. Docker を使わない場合は `FRONTEND_DEV_HOST=<LANのIP or ホスト名> pnpm dev:frontend:https`
5. スマホでは `https://<FRONTEND_DEV_HOST>:3000` を開く

`FRONTEND_DEV_HOST` には `192.168.x.x` のような LAN IP か、同じ LAN から引けるホスト名を指定してください。HTTPS 起動時には `apps/frontend/certificates/` に開発用証明書が生成され、`rootCA.pem` もそこへコピーされます。Next.js の dev サーバーはこの値をもとに LAN ホストからの HMR 接続も許可するため、変更したら frontend を再起動してください。Canvas 編集用 WebSocket も同じ frontend オリジンの `/ws` 経由で API に proxy されるため、LAN 実機では `localhost` や API ポートを直接開かず frontend 側の URL を使ってください。

スマホ側で証明書を信頼していないと、HTTPS でもブラウザがカメラ/位置情報を拒否することがあります。その場合は `apps/frontend/certificates/rootCA.pem` を端末に入れて信頼してください。

`.env` を Windows で編集した場合に改行コードが `CRLF` だと、Docker 側で `FRONTEND_DEV_HTTPS=1` の判定に失敗して HTTP で起動し、`https://<FRONTEND_DEV_HOST>:3000` で `ERR_SSL_PROTOCOL_ERROR` になることがあります。このリポジトリでは Docker 起動時に `CRLF` を吸収するようにしていますが、うまくいかない場合は `.env` を `LF` で保存し直してから frontend コンテナを再作成してください。

## Devcontainer / Codex

- `workspace` サービスでは `codex` の認証情報を `codex_config` volume に保存するため、devcontainer を rebuild しても通常は再ログイン不要です
- 認証状態を消したい場合は `docker compose down -v` を実行するか、`codex_config` volume を削除してください

## 補足

- PostgreSQL は PostGIS イメージを使用
- Redis は開発中は非永続
- `infra/docker/postgres/init/001-init.sql` は PostGIS 拡張の初期化専用
- 壁データの seed は `apps/api/src/db/seed.ts`
- `pnpm db:seed` は実行時に件数を表示するので、投入/スキップを確認できます
- Drizzle 設定は `apps/api/drizzle.config.ts`
- 画像処理、R2、本格的な MapLibre 初期化は次段階

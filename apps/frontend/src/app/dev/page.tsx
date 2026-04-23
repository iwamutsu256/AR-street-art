import Link from "next/link";
import { MapPlaceholder } from "../../components/MapPlaceholder";
import { getHealth, getWalls } from "../../lib/api";

export default async function Home() {
  const [health, walls] = await Promise.all([getHealth(), getWalls()]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="page-kicker">Street Art App</div>
        <h1>街の壁を登録して、オンラインキャンバスの入口をつくる。</h1>
        <p>
          壁画像のアップロード、四隅指定、キャンバスサイズ決定、位置情報設定までをフロントで完結させ、
          API へまとめて送る最小の登録フローを追加しました。
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/walls/new">
            新規壁登録へ
          </Link>
          <a className="button button-secondary" href="/api/walls">
            API を確認
          </a>
        </div>
      </section>

      <section className="section-card">
        <div className="section-topline">
          <div className="stack-sm">
            <div className="step-badge">System</div>
            <h2 className="section-title">Health</h2>
          </div>
        </div>
        <div className="status-grid">
          <div className="metric-pill">
            <strong>API</strong>
            <span>{health.ok ? "OK" : "NG"}</span>
          </div>
          <div className="metric-pill">
            <strong>DB</strong>
            <span>{health.db ? "Connected" : "Unavailable"}</span>
          </div>
          <div className="metric-pill">
            <strong>Redis</strong>
            <span>{health.redis ? "Connected" : "Unavailable"}</span>
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-topline">
          <div className="stack-sm">
            <div className="step-badge">Map</div>
            <h2 className="section-title">Wall Map</h2>
            <p className="section-copy">
              登録済みの壁を地図から探し、キャンバスや AR へ移動できます。
            </p>
          </div>
        </div>
        <MapPlaceholder />
      </section>

      <section className="section-card">
        <div className="section-topline">
          <div className="stack-sm">
            <div className="step-badge">Walls</div>
            <h2 className="section-title">Walls from API</h2>
          </div>
          <Link className="button button-secondary" href="/walls/new">
            壁を追加する
          </Link>
        </div>
        {walls.length === 0 ? (
          <div className="empty-state">壁データを取得できませんでした。</div>
        ) : (
          <ul
            className="wall-grid"
            style={{ listStyle: "none", padding: 0, margin: 0 }}
          >
            {walls.map((wall) => (
              <li className="wall-card" key={wall.id}>
                <div className="wall-card__image">
                  {wall.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={wall.photoUrl} alt={wall.name} />
                  ) : null}
                </div>
                <div className="wall-card__body">
                  <div style={{ fontWeight: 700, fontSize: "1.12rem" }}>
                    {wall.name}
                  </div>
                  <div className="mono">ID: {wall.id}</div>
                  <div className="muted-copy">
                    緯度経度: {wall.latitude}, {wall.longitude}
                  </div>
                  <div className="inline-actions" style={{ marginTop: 16 }}>
                    <Link
                      className="button button-secondary"
                      href={`/walls/${wall.id}`}
                    >
                      詳細を見る
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

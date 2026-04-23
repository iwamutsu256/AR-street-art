import type { Metadata } from 'next';
import Link from 'next/link';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import BottomNavigation from '../components/BottomNavigation';
import NearbyWallBanner from '../components/NearbyWallBanner';


export const metadata: Metadata = {
  title: 'Street Art App',
  description: 'Online street art canvas prototype',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="site-header__inner">
            <Link className="site-header__brand" href="/">
              Street Art App
            </Link>
            <nav className="site-header__nav" aria-label="Global">
              <Link className="site-header__link" href="/">
                マップ
              </Link>
              <Link className="site-header__link" href="/walls">
                カベ
              </Link>
              <Link className="site-header__link" href="/settings">
                設定
              </Link>
              <Link className="site-header__link site-header__link--primary" href="/walls/new">
                新規壁登録
              </Link>
            </nav>
          </div>
        </header>
        {children}

        <NearbyWallBanner />
        <BottomNavigation />
        
      </body>
    </html>
  );
}

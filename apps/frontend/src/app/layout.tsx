import type { Metadata } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import BottomNavigation from '../components/BottomNavigation';
import ChromeHeader from '../components/ChromeHeader';
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
        <ChromeHeader />
        {children}

        <NearbyWallBanner />
        <BottomNavigation />
        
      </body>
    </html>
  );
}

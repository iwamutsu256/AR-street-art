import type { Metadata } from 'next';
import { WallMap } from '../../components/walls/WallMap';

export const metadata: Metadata = {
  title: '壁マップ | Street Art App',
  description: 'Street Art App の壁マップ',
};

export default function MapPage() {
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

  return (
    <main className="page-shell page-shell--map">
      <WallMap mapTilerKey={mapTilerKey} />
    </main>
  );
}

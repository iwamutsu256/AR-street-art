import Link from 'next/link';
import type { Metadata } from 'next';
import {
  CaretRight,
  MapPin,
  MapPinArea,
  PlusCircle,
  Wall,
} from '@phosphor-icons/react/dist/ssr';
import { NearestWallButton } from '../../components/walls/NearestWallButton';

export const metadata: Metadata = {
  title: 'カベ | Street Art App',
  description: 'Street Art App の壁機能ハブ',
};

const mockLastWall = {
  name: 'Shibuya Underpass Wall',
  area: '渋谷区 / 12分前',
  canvasSize: '128 x 96px',
};

export default function WallsPage() {
  return (
    <main className="page-shell page-shell--walls-hub">
      <section className="walls-hub" aria-labelledby="walls-hub-title">
        <h1 className="sr-only" id="walls-hub-title">
          カベ
        </h1>

        <div className="walls-hub__resume">
          <div className="walls-hub__label">ペイントを再開</div>
          <article className="resume-wall-card" aria-label={`${mockLastWall.name} のキャンバス`}>
            <div className="resume-wall-card__thumb" aria-hidden="true">
              <Wall size={34} weight="duotone" />
            </div>
            <div className="resume-wall-card__body">
              <div className="resume-wall-card__name">{mockLastWall.name}</div>
              <div className="resume-wall-card__meta">
                <span>{mockLastWall.area}</span>
                <span>{mockLastWall.canvasSize}</span>
              </div>
            </div>
          </article>
        </div>

        <NearestWallButton />

        <div className="walls-hub__links" aria-label="カベメニュー">
          <Link className="walls-hub-list-button" href="/map">
            <MapPin aria-hidden="true" size={24} weight="regular" />
            <span>カベマップ</span>
            <CaretRight aria-hidden="true" size={20} weight="bold" />
          </Link>
          <Link className="walls-hub-list-button" href="/walls/new">
            <PlusCircle aria-hidden="true" size={24} weight="regular" />
            <span>カベを追加</span>
            <CaretRight aria-hidden="true" size={20} weight="bold" />
          </Link>
        </div>

        <MapPinArea className="walls-hub__watermark" aria-hidden="true" size={120} weight="thin" />
      </section>
    </main>
  );
}

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CanvasEditor } from '../../../components/canvas/CanvasEditor';
import { getCanvasSnapshot, getWall } from '../../../lib/api';

type CanvasPageProps = {
  params: Promise<{
    canvasId: string;
  }>;
};

function getCanvasWsBase() {
  return (process.env.NEXT_PUBLIC_WS_BASE ?? '/ws').trim().replace(/\/$/, '') || '/ws';
}

export async function generateMetadata({ params }: CanvasPageProps): Promise<Metadata> {
  const { canvasId } = await params;
  const snapshot = await getCanvasSnapshot(canvasId);

  return {
    title: snapshot ? `Canvas ${canvasId} | Street Art App` : 'Canvas | Street Art App',
    description: snapshot ? `${snapshot.width}x${snapshot.height} のリアルタイムキャンバス` : 'Street Art App のキャンバス編集画面',
  };
}

export default async function CanvasPage({ params }: CanvasPageProps) {
  const { canvasId } = await params;
  const snapshot = await getCanvasSnapshot(canvasId);

  if (!snapshot) {
    notFound();
  }

  const wall = await getWall(snapshot.wallId);

  return (
    <main className="page-shell page-shell--editor">
      <CanvasEditor
        initialSnapshot={snapshot}
        leaveHref={`/?focusWallId=${encodeURIComponent(snapshot.wallId)}`}
        referenceImageUrl={wall?.rectifiedImageUrl}
        wallName={wall?.name}
        wsBase={getCanvasWsBase()}
      />
    </main>
  );
}

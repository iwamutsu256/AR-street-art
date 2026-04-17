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
  const explicitBase = (process.env.NEXT_PUBLIC_WS_BASE ?? '/ws').replace(/\/$/, '');

  if (/^wss?:\/\//.test(explicitBase)) {
    return explicitBase;
  }

  const appOrigin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3000');
  const apiPort = process.env.API_PORT?.trim();
  const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/$/, '');

  if (apiProxyTarget) {
    const proxyUrl = new URL(apiProxyTarget);
    const isLocalBrowserReachableHost =
      proxyUrl.hostname === 'localhost' ||
      proxyUrl.hostname === '127.0.0.1' ||
      proxyUrl.hostname === appOrigin.hostname;

    if (isLocalBrowserReachableHost) {
      const wsOrigin = apiProxyTarget.replace(/^http/, 'ws');
      return `${wsOrigin}${explicitBase}`;
    }
  }

  const protocol = appOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = apiPort ? `${appOrigin.hostname}:${apiPort}` : appOrigin.host;
  return `${protocol}//${host}${explicitBase}`;
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
        leaveHref={wall ? `/walls/${wall.id}` : '/'}
        referenceImageUrl={wall?.rectifiedImageUrl}
        wallName={wall?.name}
        wsBase={getCanvasWsBase()}
      />
    </main>
  );
}

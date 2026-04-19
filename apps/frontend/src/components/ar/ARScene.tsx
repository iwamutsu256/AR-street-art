'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import ScanGuide from './ScanGuide';

interface Props {
  rectifiedUrl: string;
  artworkUrl: string;
  aspectRatio: number;
}

type Phase = 'loading' | 'compiling' | 'scanning' | 'found' | 'error';

export default function ARScene({ rectifiedUrl, artworkUrl, aspectRatio }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [aframeReady, setAframeReady] = useState(false); 

  const mindUrlRef = useRef('');
  const startedRef = useRef(false);

  const startAR = async () => {
    if (startedRef.current || !containerRef.current) return;
    startedRef.current = true;
    setPhase('compiling');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cv = (window as any).MINDAR?.IMAGE;
      if (!cv) throw new Error('MindAR が読み込まれていません');

      const compiler = new cv.Compiler();

      const imgSrc = rectifiedUrl.startsWith('blob:')
        ? rectifiedUrl
        : `/api/proxy-image?url=${encodeURIComponent(rectifiedUrl)}`;

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Rectified 画像の読み込みに失敗しました'));
        img.src = imgSrc;
      });

      await compiler.compileImageTargets([img], (progress: number) => {
        console.log('compile progress:', progress);
      });
      const buffer = await compiler.exportData();
      const mindUrl = URL.createObjectURL(new Blob([buffer]));
      mindUrlRef.current = mindUrl;

      const planeHeight = aspectRatio >= 1 ? 1 / aspectRatio : 1;
      const planeWidth = aspectRatio >= 1 ? 1 : aspectRatio;

      const artSrc = artworkUrl.startsWith('blob:') || artworkUrl.startsWith('data:')
        ? artworkUrl
        : `/api/proxy-image?url=${encodeURIComponent(artworkUrl)}`;

      containerRef.current.innerHTML = `
        <a-scene
          mindar-image="imageTargetSrc: ${mindUrl}; autoStart: true; uiError: no; uiScanning: no; filterMinCF: 0.001; filterBeta: 0.001;"
          color-space="sRGB"
          renderer="colorManagement: true; physicallyCorrectLights: true"
          vr-mode-ui="enabled: false"
          device-orientation-permission-ui="enabled: false"
          style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:10;"
        >
          <a-assets>
            <img id="artwork-tex" src="${artSrc}" crossorigin="anonymous" />
          </a-assets>
          <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
          <a-entity mindar-image-target="targetIndex: 0">
            <a-plane
              src="#artwork-tex"
              width="${planeWidth}"
              height="${planeHeight}"
              position="0 0 0"
              rotation="0 0 0"
              material="transparent: true; alphaTest: 0.5;"
            ></a-plane>
          </a-entity>
        </a-scene>
      `;

      const entity = containerRef.current.querySelector('[mindar-image-target]');
      entity?.addEventListener('targetFound', () => setPhase('found'));
      entity?.addEventListener('targetLost', () => setPhase('scanning'));

      setPhase('scanning');
    } catch (err) {
      setPhase('error');
      setErrorMsg((err as Error).message);
    }
  };

  useEffect(() => {
    return () => {
      if (mindUrlRef.current) URL.revokeObjectURL(mindUrlRef.current);
      const video = document.querySelector('video');
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  return (
    <>
          <Script
        src="https://cdn.jsdelivr.net/gh/aframevr/aframe@v1.4.0/dist/aframe.min.js"
        strategy="afterInteractive"
        onLoad={() => setAframeReady(true)}
      />
      <Script
        src="https://aframe.io/releases/1.5.0/aframe.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js';
          s.onload = startAR;
          document.head.appendChild(s);
        }}
      />



      <div style={{ position: 'fixed', inset: 0, background: 'black', zIndex: 10 }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 30 }}>
        {phase === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ color: 'white', textAlign: 'center', display: 'grid', gap: 12 }}>
              <div className="ar-spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white', margin: '0 auto' }} />
              <p style={{ margin: 0, fontSize: 14 }}>AR 機能を読み込み中...</p>
            </div>
          </div>
        )}

        {phase === 'compiling' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ color: 'white', textAlign: 'center', display: 'grid', gap: 12 }}>
              <div className="ar-spinner" style={{ borderColor: 'rgba(34,197,94,0.3)', borderTopColor: 'rgb(34,197,94)', margin: '0 auto' }} />
              <p style={{ margin: 0, fontSize: 14 }}>壁のマーカーを生成中...</p>
              <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>初回は 10〜20 秒かかります</p>
            </div>
          </div>
        )}

        {phase === 'scanning' && <ScanGuide />}

        {phase === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', pointerEvents: 'auto' }}>
            <div style={{
              background: 'rgba(0,0,0,0.82)',
              color: 'white',
              padding: '24px',
              borderRadius: 18,
              textAlign: 'center',
              maxWidth: 300,
              display: 'grid',
              gap: 10,
            }}>
              <p style={{ margin: 0, color: '#f87171', fontWeight: 600 }}>エラーが発生しました</p>
              <p style={{ margin: 0, fontSize: 13, color: '#d1d5db' }}>{errorMsg}</p>
              <button
                onClick={() => { startedRef.current = false; startAR(); }}
                style={{ marginTop: 8, padding: '10px 20px', background: 'rgb(34,197,94)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer' }}
              >
                再試行
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

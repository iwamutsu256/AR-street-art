'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import ScanGuide from './ScanGuide';
import { Spinner } from '../Spinner';

interface Props {
  rectifiedUrl: string;
  artworkUrl: string;
  aspectRatio: number;
}

type Phase = 'loading' | 'compiling' | 'scanning' | 'found' | 'error';

type TextureLike = {
  [key: string]: unknown;
  magFilter?: number;
  minFilter?: number;
  generateMipmaps?: boolean;
  anisotropy?: number;
  needsUpdate?: boolean;
};

type MaterialLike = {
  [key: string]: unknown;
  map?: TextureLike | null;
  alphaMap?: TextureLike | null;
  emissiveMap?: TextureLike | null;
  needsUpdate?: boolean;
};

type MeshLike = {
  material?: MaterialLike | MaterialLike[];
};

type Object3DLike = MeshLike & {
  traverse?: (callback: (object: MeshLike) => void) => void;
};

type PixelArtAFrameElement = {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  getObject3D?: (type: string) => Object3DLike | undefined;
  object3D?: Object3DLike;
  components?: {
    material?: {
      material?: MaterialLike | MaterialLike[];
    };
  };
};

type PixelArtAFrameComponent = {
  el: PixelArtAFrameElement;
  applyPixelTextureFilters?: () => void;
};

type AFrameGlobal = {
  THREE: {
    NearestFilter: number;
  };
  components?: Record<string, unknown>;
  registerComponent: (name: string, component: unknown) => void;
};

const PIXEL_ART_COMPONENT = 'pixel-art-texture';
const TEXTURE_FIELDS = ['map', 'alphaMap', 'emissiveMap'] as const;
const TEXTURE_READY_EVENTS = ['loaded', 'materialloaded', 'materialtextureloaded'] as const;

function isTextureLike(value: unknown): value is TextureLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      ('isTexture' in value || 'image' in value || 'needsUpdate' in value)
  );
}

function applyNearestFilterToTexture(texture: TextureLike, nearestFilter: number) {
  texture.magFilter = nearestFilter;
  texture.minFilter = nearestFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 0;
  texture.needsUpdate = true;
}

function applyNearestFilterToMaterial(
  material: MaterialLike | MaterialLike[] | null | undefined,
  nearestFilter: number
) {
  const materials = Array.isArray(material) ? material : [material];

  for (const item of materials) {
    if (!item) continue;

    for (const field of TEXTURE_FIELDS) {
      const texture = item[field];
      if (isTextureLike(texture)) {
        applyNearestFilterToTexture(texture, nearestFilter);
      }
    }

    item.needsUpdate = true;
  }
}

function applyPixelTextureFilters(el: PixelArtAFrameElement, nearestFilter: number) {
  applyNearestFilterToMaterial(el.components?.material?.material, nearestFilter);

  const object3D = el.getObject3D?.('mesh') ?? el.object3D;
  if (!object3D) return;

  applyNearestFilterToMaterial(object3D.material, nearestFilter);
  object3D.traverse?.((object) => {
    applyNearestFilterToMaterial(object.material, nearestFilter);
  });
}

function registerPixelArtTextureComponent() {
  const AFRAME = (window as Window & { AFRAME?: AFrameGlobal }).AFRAME;
  if (!AFRAME || AFRAME.components?.[PIXEL_ART_COMPONENT]) return;

  AFRAME.registerComponent(PIXEL_ART_COMPONENT, {
    init(this: PixelArtAFrameComponent) {
      this.applyPixelTextureFilters = () => {
        applyPixelTextureFilters(this.el, AFRAME.THREE.NearestFilter);
      };

      for (const eventName of TEXTURE_READY_EVENTS) {
        this.el.addEventListener(eventName, this.applyPixelTextureFilters);
      }

      this.applyPixelTextureFilters();
    },

    update(this: PixelArtAFrameComponent) {
      this.applyPixelTextureFilters?.();
    },

    remove(this: PixelArtAFrameComponent) {
      if (!this.applyPixelTextureFilters) return;

      for (const eventName of TEXTURE_READY_EVENTS) {
        this.el.removeEventListener(eventName, this.applyPixelTextureFilters);
      }
    },
  });
}

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
      registerPixelArtTextureComponent();

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
          renderer="colorManagement: true"
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
              pixel-art-texture
              src="#artwork-tex"
              width="${planeWidth}"
              height="${planeHeight}"
              position="0 0 0"
              rotation="0 0 0"
              material="shader: flat; transparent: true; alphaTest: 0.5;"
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
      const aScene = containerRef.current?.querySelector('a-scene') as any;
      if (aScene) {
        try {
          const mindarSystem = aScene.systems?.['mindar-image-system'] as any;
          if (mindarSystem) {
            mindarSystem._resize = () => {};
            if (mindarSystem.controller) {
              mindarSystem.controller.stopProcessVideo?.();
            }
          }
          if (aScene.renderer) {
            aScene.renderer.setAnimationLoop(null);
          }
          if (aScene.destroy) {
            aScene.destroy();
          }
        } catch (e) {
          console.warn('AR scene cleanup error:', e);
        }
      }

      document.querySelectorAll('video').forEach((video) => {
        if (video.srcObject) {
          (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
          video.srcObject = null;
        }
      });

      document.documentElement.classList.remove('a-fullscreen');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('height');

      if (mindUrlRef.current) URL.revokeObjectURL(mindUrlRef.current);
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  return (
    <>
      <Script
        src="https://aframe.io/releases/1.5.0/aframe.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          setAframeReady(true);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).MINDAR) {
            startAR();
            return;
          }
          const s = document.createElement('script');
          s.src = '/mindar-image-aframe.prod.js';
          s.onload = startAR;
          document.head.appendChild(s);
        }}
      />

      <div className="fixed inset-0 z-10 bg-bg-inverse">
        <div className="h-full w-full" ref={containerRef} />
      </div>

      <div className="pointer-events-none fixed inset-0 z-30">
        {phase === 'loading' && (
          <div className="flex h-full items-center justify-center">
            <div className="grid gap-3 text-center text-fg-inverse">
              <Spinner tone="inverse" />
              <p className="m-0 text-sm">AR 機能を読み込み中...</p>
            </div>
          </div>
        )}

        {phase === 'compiling' && (
          <div className="flex h-full items-center justify-center">
            <div className="grid gap-3 text-center text-fg-inverse">
              <Spinner tone="success" />
              <p className="m-0 text-sm">壁のマーカーを生成中...</p>
              <p className="m-0 text-xs text-white/60">初回は 10〜20 秒かかります</p>
            </div>
          </div>
        )}

        {phase === 'scanning' && <ScanGuide />}

        {phase === 'error' && (
          <div className="pointer-events-auto flex h-full items-center justify-center">
            <div className="grid max-w-[300px] gap-2.5 rounded-[18px] bg-[rgba(20,17,14,0.82)] p-6 text-center text-fg-inverse">
              <p className="m-0 font-semibold text-danger">エラーが発生しました</p>
              <p className="m-0 text-[13px] text-white/80">{errorMsg}</p>
              <button
                onClick={() => { startedRef.current = false; startAR(); }}
                className="mt-2 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-success px-5 text-sm text-fg-inverse"
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

'use client';

import { useEffectEvent, useRef, useState } from 'react';
import type { CornerCoordinate } from '@street-art/shared';
import { clamp } from '../../lib/walls';

const CORNER_LABELS = ['左上', '右上', '右下', '左下'];

type CornerEditorProps = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  imageAlt?: string;
  value: CornerCoordinate[];
  onChange: (corners: CornerCoordinate[]) => void;
};

export function CornerEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  imageAlt = '選択した壁画像',
  value,
  onChange,
}: CornerEditorProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const emitChange = useEffectEvent(onChange);
  const [dragState, setDragState] = useState<{ index: number; pointerId: number } | null>(null);

  function updateCorner(clientX: number, clientY: number, index: number) {
    const rect = imageRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const nextX = clamp(((clientX - rect.left) / rect.width) * imageWidth, 0, imageWidth);
    const nextY = clamp(((clientY - rect.top) / rect.height) * imageHeight, 0, imageHeight);
    const nextCorners = value.map((corner, cornerIndex) =>
      cornerIndex === index ? { x: nextX, y: nextY } : corner
    );

    emitChange(nextCorners);
  }

  function maybeAutoScroll(clientY: number) {
    const threshold = 96;
    const scrollStep = 28;

    if (clientY > window.innerHeight - threshold) {
      window.scrollBy({ top: scrollStep, behavior: 'auto' });
      return;
    }

    if (clientY < threshold) {
      window.scrollBy({ top: -scrollStep, behavior: 'auto' });
    }
  }

  const maxDimension = Math.max(imageWidth, imageHeight);
  const hitRadius = Math.max(56, Math.round(maxDimension * 0.018));
  const outerRadius = Math.max(26, Math.round(maxDimension * 0.009));
  const innerRadius = Math.max(14, Math.round(maxDimension * 0.0055));
  const labelOffset = Math.max(40, Math.round(maxDimension * 0.014));
  const labelFontSize = Math.max(26, Math.round(maxDimension * 0.009));
  const polygonStrokeWidth = Math.max(8, Math.round(maxDimension * 0.003));
  const polygonPoints = value.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="stack-md">
      <div className="editor-frame">
        <div className="editor-stage">
          <div
            className="editor-surface"
            onLostPointerCapture={() => setDragState(null)}
            onPointerCancel={(event) => {
              if (dragState && dragState.pointerId === event.pointerId) {
                setDragState(null);
              }
            }}
            onPointerMove={(event) => {
              if (!dragState || dragState.pointerId !== event.pointerId) {
                return;
              }

              event.preventDefault();
              maybeAutoScroll(event.clientY);
              updateCorner(event.clientX, event.clientY, dragState.index);
            }}
            onPointerUp={(event) => {
              if (!dragState || dragState.pointerId !== event.pointerId) {
                return;
              }

              if (surfaceRef.current?.hasPointerCapture(event.pointerId)) {
                surfaceRef.current.releasePointerCapture(event.pointerId);
              }
              setDragState(null);
            }}
            ref={surfaceRef}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="editor-image" ref={imageRef} src={imageUrl} alt={imageAlt} />
            <svg
              className="editor-overlay"
              preserveAspectRatio="none"
              viewBox={`0 0 ${imageWidth} ${imageHeight}`}
            >
              <polygon
                className="editor-polygon"
                points={polygonPoints}
                style={{ strokeWidth: polygonStrokeWidth }}
              />
              {value.map((point, index) => (
                <g
                  key={CORNER_LABELS[index]}
                  className="editor-handle"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    surfaceRef.current?.setPointerCapture(event.pointerId);
                    setDragState({ index, pointerId: event.pointerId });
                    updateCorner(event.clientX, event.clientY, index);
                  }}
                >
                  <circle cx={point.x} cy={point.y} r={hitRadius} fill="transparent" />
                  <circle cx={point.x} cy={point.y} r={outerRadius} fill="var(--color-foreground-on-dark)" fillOpacity={0.98} />
                  <circle cx={point.x} cy={point.y} r={innerRadius} fill="var(--color-primary)" fillOpacity={0.95} />
                  <text
                    x={point.x}
                    y={Math.max(point.y - labelOffset, labelFontSize)}
                    textAnchor="middle"
                    fontSize={labelFontSize}
                    fontWeight="700"
                    fill="var(--color-foreground)"
                    pointerEvents="none"
                  >
                    {index + 1}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>

      <div className="metrics-grid">
        {value.map((corner, index) => (
          <div className="metric-pill" key={CORNER_LABELS[index]}>
            <strong>{CORNER_LABELS[index]}</strong>
            <span>
              {Math.round(corner.x)}, {Math.round(corner.y)}
            </span>
          </div>
        ))}
      </div>

      <div className="editor-help">
        4つのハンドルをドラッグして、キャンバスにしたい範囲の四隅へ合わせてください。辺と塗りつぶしが
        選択範囲です。
      </div>
    </div>
  );
}

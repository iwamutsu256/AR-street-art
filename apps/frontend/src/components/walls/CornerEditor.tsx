"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { CornerCoordinate } from "@street-art/shared";
import { clamp } from "../../lib/walls";

const CORNER_LABELS = ["左上", "右上", "右下", "左下"];
const SCOPE_ZOOM = 3;
const SCOPE_MARGIN = 16;

type CornerEditorProps = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  imageAlt?: string;
  value: CornerCoordinate[];
  onChange: (corners: CornerCoordinate[]) => void;
};

function getScopePlacementStyle(index: number) {
  switch (index) {
    case 0:
      return { right: SCOPE_MARGIN, bottom: SCOPE_MARGIN };
    case 1:
      return { left: SCOPE_MARGIN, bottom: SCOPE_MARGIN };
    case 2:
      return { left: SCOPE_MARGIN, top: SCOPE_MARGIN };
    case 3:
      return { right: SCOPE_MARGIN, top: SCOPE_MARGIN };
    default:
      return { right: SCOPE_MARGIN, bottom: SCOPE_MARGIN };
  }
}

export function CornerEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  imageAlt = "選択した壁画像",
  value,
  onChange,
}: CornerEditorProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const emitChange = useEffectEvent(onChange);
  const [dragState, setDragState] = useState<{
    index: number;
    pointerId: number;
  } | null>(null);
  const [imageFrame, setImageFrame] = useState({ width: 0, height: 0 });

  function updateImageFrame() {
    const image = imageRef.current;

    if (!image) {
      return;
    }

    const rect = image.getBoundingClientRect();
    const nextWidth = rect.width;
    const nextHeight = rect.height;

    setImageFrame((current) => {
      if (current.width === nextWidth && current.height === nextHeight) {
        return current;
      }

      return {
        width: nextWidth,
        height: nextHeight,
      };
    });
  }

  useEffect(() => {
    updateImageFrame();

    const image = imageRef.current;

    if (!image) {
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateImageFrame);

      return () => {
        window.removeEventListener("resize", updateImageFrame);
      };
    }

    const observer = new ResizeObserver(() => {
      updateImageFrame();
    });

    observer.observe(image);

    return () => {
      observer.disconnect();
    };
  }, [imageUrl]);

  function updateCorner(clientX: number, clientY: number, index: number) {
    const rect = imageRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const nextX = clamp(
      ((clientX - rect.left) / rect.width) * imageWidth,
      0,
      imageWidth,
    );
    const nextY = clamp(
      ((clientY - rect.top) / rect.height) * imageHeight,
      0,
      imageHeight,
    );
    const nextCorners = value.map((corner, cornerIndex) =>
      cornerIndex === index ? { x: nextX, y: nextY } : corner,
    );

    emitChange(nextCorners);
  }

  function maybeAutoScroll(clientY: number) {
    const threshold = 96;
    const scrollStep = 28;

    if (clientY > window.innerHeight - threshold) {
      window.scrollBy({ top: scrollStep, behavior: "auto" });
      return;
    }

    if (clientY < threshold) {
      window.scrollBy({ top: -scrollStep, behavior: "auto" });
    }
  }

  const maxDimension = Math.max(imageWidth, imageHeight);
  const hitRadius = Math.max(56, Math.round(maxDimension * 0.018));
  const handleRadius = Math.max(34, Math.round(maxDimension * 0.0115));
  const handleStrokeWidth = Math.max(6, Math.round(maxDimension * 0.0022));
  const polygonStrokeWidth = Math.max(8, Math.round(maxDimension * 0.003));
  const polygonPoints = value.map((point) => `${point.x},${point.y}`).join(" ");
  const activePoint = dragState ? value[dragState.index] : null;
  const scaleX = imageWidth > 0 ? imageFrame.width / imageWidth : 0;
  const scaleY = imageHeight > 0 ? imageFrame.height / imageHeight : 0;
  const scopeSize =
    imageFrame.width > 0 && imageFrame.height > 0
      ? clamp(
          Math.round(Math.min(imageFrame.width, imageFrame.height) * 0.34),
          136,
          220,
        )
      : 0;
  const scopeTranslateX =
    activePoint && scopeSize > 0
      ? scopeSize / 2 - activePoint.x * scaleX * SCOPE_ZOOM
      : 0;
  const scopeTranslateY =
    activePoint && scopeSize > 0
      ? scopeSize / 2 - activePoint.y * scaleY * SCOPE_ZOOM
      : 0;

  function renderHandleCircles(point: CornerCoordinate) {
    return (
      <>
        <circle cx={point.x} cy={point.y} r={hitRadius} fill="transparent" />
        <circle
          cx={point.x}
          cy={point.y}
          r={handleRadius}
          fill="rgba(255, 255, 255, 0.4)"
          stroke="var(--color-primary)"
          strokeWidth={handleStrokeWidth}
        />
      </>
    );
  }

  return (
    <div
      className="relative inline-block select-none leading-none touch-none"
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
      <img
        className="block h-auto w-auto max-h-[min(72vh,720px)] max-w-[min(100%,960px)]"
        ref={imageRef}
        src={imageUrl}
        alt={imageAlt}
        onLoad={updateImageFrame}
      />
      <svg
        className="absolute inset-0 overflow-visible"
        preserveAspectRatio="none"
        viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      >
        <polygon
          className="fill-transparent stroke-[rgba(182,76,45,0.88)] [stroke-linejoin:round]"
          points={polygonPoints}
          style={{ strokeWidth: polygonStrokeWidth }}
        />
        {value.map((point, index) => (
          <g
            key={CORNER_LABELS[index]}
            className={`cursor-grab active:cursor-grabbing${dragState?.index === index ? " drop-shadow-[0_0_14px_rgba(182,76,45,0.34)]" : ""}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              surfaceRef.current?.setPointerCapture(event.pointerId);
              setDragState({ index, pointerId: event.pointerId });
              updateCorner(event.clientX, event.clientY, index);
            }}
          >
            {renderHandleCircles(point)}
          </g>
        ))}
      </svg>
      {dragState && activePoint && scopeSize > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-2 overflow-hidden rounded-full border-2 border-primary bg-[rgba(23,19,15,0.18)] shadow-[0_14px_28px_rgba(24,19,14,0.24)] backdrop-blur-[4px]"
          style={{
            width: scopeSize,
            height: scopeSize,
            ...getScopePlacementStyle(dragState.index),
          }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-full bg-[rgba(255,248,238,0.92)]">
            <div
              className="absolute left-0 top-0 origin-top-left will-change-transform"
              style={{
                width: imageFrame.width,
                height: imageFrame.height,
                transform: `translate3d(${scopeTranslateX}px, ${scopeTranslateY}px, 0) scale(${SCOPE_ZOOM})`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="block h-full w-full" src={imageUrl} />
              <svg
                className="absolute inset-0 overflow-visible"
                preserveAspectRatio="none"
                viewBox={`0 0 ${imageWidth} ${imageHeight}`}
              >
                <polygon
                  className="fill-transparent stroke-[rgba(182,76,45,0.88)] [stroke-linejoin:round]"
                  points={polygonPoints}
                  style={{ strokeWidth: polygonStrokeWidth }}
                />
                {value.map((point, index) => (
                  <g
                    key={`${CORNER_LABELS[index]}-scope`}
                    className={`cursor-grab active:cursor-grabbing${dragState.index === index ? " drop-shadow-[0_0_14px_rgba(182,76,45,0.34)]" : ""}`}
                  >
                    {renderHandleCircles(point)}
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

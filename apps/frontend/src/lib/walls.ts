import { CANVAS_MAX_SIZE, type CanvasDimensions, type CornerCoordinate } from '@street-art/shared';

export const CANVAS_MIN_SIZE = 32;

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getDefaultCornerCoordinates(width: number, height: number): CornerCoordinate[] {
  const insetX = Math.max(24, Math.round(width * 0.08));
  const insetY = Math.max(24, Math.round(height * 0.08));

  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY },
  ];
}

function getDistance(a: CornerCoordinate, b: CornerCoordinate) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function getCornerAspectRatio(corners: CornerCoordinate[]) {
  const top = getDistance(corners[0], corners[1]);
  const right = getDistance(corners[1], corners[2]);
  const bottom = getDistance(corners[2], corners[3]);
  const left = getDistance(corners[3], corners[0]);

  const averageWidth = (top + bottom) / 2;
  const averageHeight = (left + right) / 2;

  if (!Number.isFinite(averageWidth) || !Number.isFinite(averageHeight) || averageHeight <= 0) {
    return 1;
  }

  return averageWidth / averageHeight;
}

export function getCanvasDimensions(longSide: number, aspectRatio: number): CanvasDimensions {
  const safeLongSide = clamp(Math.round(longSide), CANVAS_MIN_SIZE, CANVAS_MAX_SIZE);
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;

  if (safeAspectRatio >= 1) {
    return {
      width: safeLongSide,
      height: Math.max(1, Math.round(safeLongSide / safeAspectRatio)),
    };
  }

  return {
    width: Math.max(1, Math.round(safeLongSide * safeAspectRatio)),
    height: safeLongSide,
  };
}

export function formatCoordinate(value: number) {
  return value.toFixed(6);
}

export function buildFocusedWallMapHref(wallId: string) {
  return `/?focusWallId=${encodeURIComponent(wallId)}`;
}

export function serializeCornerCoordinates(corners: CornerCoordinate[]) {
  return corners.map(({ x, y }) => ({
    x: Math.round(x),
    y: Math.round(y),
  }));
}

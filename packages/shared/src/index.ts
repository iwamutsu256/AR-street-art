export type CornerCoordinate = {
  x: number;
  y: number;
};

export type CanvasDimensions = {
  width: number;
  height: number;
};

export type WallSummary = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  photoUrl?: string | null;
};

export type CanvasSummary = {
  id: string;
  width: number;
  height: number;
  paletteVersion: string;
  activeConnectionCount: number;
};

export type PaletteDefinition = {
  version: string;
  name: string;
  colors: string[];
};

export type CanvasSnapshot = {
  type: 'canvas:snapshot';
  canvasId: string;
  wallId: string;
  width: number;
  height: number;
  paletteVersion: string;
  palette: string[];
  pixels: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type PixelSetMessage = {
  type: 'pixel:set';
  canvasId: string;
  x: number;
  y: number;
  color: number;
};

export type PixelAppliedMessage = {
  type: 'pixel:applied';
  canvasId: string;
  x: number;
  y: number;
  color: number;
};

export type CanvasErrorMessage = {
  type: 'error';
  message: string;
  issues?: unknown;
};

export type CanvasRealtimeMessage = CanvasSnapshot | PixelAppliedMessage | CanvasErrorMessage;

export type WallDetail = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  originalImageUrl: string | null;
  thumbnailImageUrl: string | null;
  rectifiedImageUrl: string | null;
  photoUrl?: string | null;
  cornerCoordinates: CornerCoordinate[];
  approxHeading: number | null;
  visibilityRadiusM: number;
  createdAt: string | Date;
  canvas?: CanvasSummary | null;
};

export type CreateWallResponse = WallDetail & {
  message: string;
};

export const CANVAS_MAX_SIZE = 512;
export const DEFAULT_CANVAS_SIZE = 128;
export const CANVAS_COLOR_COUNT = 32;
export const TRANSPARENT_PIXEL_VALUE = 0;
export const DEFAULT_PALETTE_VERSION = 'v1';
export const DEFAULT_PALETTE_NAME = 'default';
export const DEFAULT_PALETTE_COLORS = [
  '#fff8f0',
  '#f2e8dc',
  '#c7b8a3',
  '#8f7e67',
  '#4b4037',
  '#13100d',
  '#ffb3c1',
  '#ff7a93',
  '#d94a65',
  '#8f213c',
  '#ff9f68',
  '#f97316',
  '#c2410c',
  '#7c2d12',
  '#ffd166',
  '#facc15',
  '#ca8a04',
  '#713f12',
  '#d9f99d',
  '#84cc16',
  '#4d7c0f',
  '#365314',
  '#86efac',
  '#22c55e',
  '#15803d',
  '#14532d',
  '#7dd3fc',
  '#38bdf8',
  '#2563eb',
  '#1d4ed8',
  '#c4b5fd',
  '#8b5cf6',
] satisfies string[];

export function normalizePixelValue(value: number, paletteLength: number) {
  if (!Number.isInteger(value) || value < TRANSPARENT_PIXEL_VALUE) {
    return TRANSPARENT_PIXEL_VALUE;
  }

  return value <= Math.max(paletteLength, 0) ? value : TRANSPARENT_PIXEL_VALUE;
}

export function getPaletteIndexFromPixelValue(value: number) {
  return value === TRANSPARENT_PIXEL_VALUE ? null : value - 1;
}

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
};

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

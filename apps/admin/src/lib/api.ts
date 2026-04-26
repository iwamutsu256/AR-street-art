const API_URL = (process.env.INTERNAL_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export type Wall = {
  id: string;
  name: string;
  displayAddress: string | null;
  latitude: number;
  longitude: number;
  photoUrl: string | null;
  createdAt: string;
};

export type WallDetail = Wall & {
  originalImageUrl: string | null;
  thumbnailImageUrl: string | null;
  rectifiedImageUrl: string | null;
  cornerCoordinates: { x: number; y: number }[];
  approxHeading: number | null;
  visibilityRadiusM: number;
  canvas: {
    id: string;
    width: number;
    height: number;
    paletteVersion: string;
  } | null;
};

export async function fetchWalls(): Promise<Wall[]> {
  const res = await fetch(`${API_URL}/walls`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch walls: ${res.status}`);
  return res.json();
}

export async function fetchWall(id: string): Promise<WallDetail | null> {
  const res = await fetch(`${API_URL}/walls/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch wall: ${res.status}`);
  return res.json();
}

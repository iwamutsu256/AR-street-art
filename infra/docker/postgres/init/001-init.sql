CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS walls (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  photo_url TEXT,
  approx_heading INTEGER,
  visibility_radius_m INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  wall_id TEXT NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  palette_version TEXT NOT NULL DEFAULT 'v1',
  pixel_data BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO walls (id, name, latitude, longitude, photo_url, approx_heading, visibility_radius_m)
VALUES
  ('demo-wall-1', 'Tokyo Station Demo Wall', 35.6809591, 139.7673068, 'https://images.unsplash.com/photo-1529429617124-aee711a5ac1c?auto=format&fit=crop&w=800&q=80', 180, 40),
  ('demo-wall-2', 'Kanda Demo Shutter', 35.6950, 139.7700, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80', 90, 40)
ON CONFLICT (id) DO NOTHING;

INSERT INTO canvases (id, wall_id, width, height)
VALUES
  ('demo-canvas-1', 'demo-wall-1', 128, 128),
  ('demo-canvas-2', 'demo-wall-2', 128, 128)
ON CONFLICT (id) DO NOTHING;

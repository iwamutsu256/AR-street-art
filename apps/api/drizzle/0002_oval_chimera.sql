CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
ALTER TABLE "walls" ADD COLUMN "geom" geography(Point, 4326);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geom_idx" ON "walls" USING gist ("geom");
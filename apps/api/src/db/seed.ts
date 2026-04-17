import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { count } from "drizzle-orm";
import { env } from "../lib/env.js";
import { db, sql } from "../lib/db.js";
import { canvases, walls } from "./schema.js";

const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

type CornerCoordinate = { x: number; y: number };

function unsplashImage(
  photoId: string,
  options: { width: number; height?: number; fit?: "crop" | "max" },
) {
  const url = new URL(`https://images.unsplash.com/${photoId}`);
  url.searchParams.set("auto", "format");
  url.searchParams.set("fm", "jpg");
  url.searchParams.set("q", "80");
  url.searchParams.set("fit", options.fit ?? "crop");
  url.searchParams.set("w", String(options.width));

  if (options.height) {
    url.searchParams.set("h", String(options.height));
  }

  return url.toString();
}

function corners(points: CornerCoordinate[]) {
  return points;
}

const wallSeeds = [
  {
    id: "demo-wall-1",
    name: "Tokyo Station Demo Wall",
    latitude: 35.6809591,
    longitude: 139.7673068,
    originalImageUrl: unsplashImage("photo-1529429617124-aee711a5ac1c", {
      width: 1600,
      height: 1200,
    }),
    thumbnailImageUrl: unsplashImage("photo-1529429617124-aee711a5ac1c", {
      width: 800,
      height: 800,
    }),
    rectifiedImageUrl: unsplashImage("photo-1529429617124-aee711a5ac1c", {
      width: 1200,
      height: 800,
    }),
    cornerCoordinates: corners([
      { x: 220, y: 180 },
      { x: 1370, y: 165 },
      { x: 1415, y: 980 },
      { x: 200, y: 1030 },
    ]),
    approxHeading: 180,
    visibilityRadiusM: 40,
  },
  {
    id: "demo-wall-2",
    name: "Kanda Demo Shutter",
    latitude: 35.695,
    longitude: 139.77,
    originalImageUrl: unsplashImage("photo-1513694203232-719a280e022f", {
      width: 1600,
      height: 1200,
    }),
    thumbnailImageUrl: unsplashImage("photo-1513694203232-719a280e022f", {
      width: 800,
      height: 800,
    }),
    rectifiedImageUrl: unsplashImage("photo-1513694203232-719a280e022f", {
      width: 1080,
      height: 1080,
    }),
    cornerCoordinates: corners([
      { x: 290, y: 190 },
      { x: 1290, y: 245 },
      { x: 1265, y: 1125 },
      { x: 255, y: 1090 },
    ]),
    approxHeading: 90,
    visibilityRadiusM: 40,
  },
] satisfies (typeof walls.$inferInsert)[];

const canvasSeeds = [
  {
    id: "demo-canvas-1",
    wallId: "demo-wall-1",
    width: 192,
    height: 128,
  },
  {
    id: "demo-canvas-2",
    wallId: "demo-wall-2",
    width: 160,
    height: 160,
  },
] satisfies (typeof canvases.$inferInsert)[];

function formatDatabaseTarget(databaseUrl: string) {
  const { hostname, port, pathname } = new URL(databaseUrl);
  const databaseName = pathname.replace(/^\//, "");
  return `${hostname}${port ? `:${port}` : ""}/${databaseName}`;
}

async function main() {
  console.log(`Seeding database: ${formatDatabaseTarget(env.databaseUrl)}`);
  await migrate(db, { migrationsFolder });

  const [wallsBeforeResult] = await db.select({ count: count() }).from(walls);
  const wallsBeforeCount = Number(wallsBeforeResult.count);

  const [canvasesBeforeResult] = await db.select({ count: count() }).from(canvases);
  const canvasesBeforeCount = Number(canvasesBeforeResult.count);

  const insertedWalls = await db
    .insert(walls)
    .values(wallSeeds)
    .onConflictDoNothing({ target: walls.id })
    .returning({ id: walls.id, name: walls.name });

  const insertedCanvases = await db
    .insert(canvases)
    .values(canvasSeeds)
    .onConflictDoNothing({ target: canvases.id })
    .returning({ id: canvases.id, wallId: canvases.wallId });

  const [wallsAfterResult] = await db.select({ count: count() }).from(walls);
  const wallsAfterCount = Number(wallsAfterResult.count);

  const [canvasesAfterResult] = await db.select({ count: count() }).from(canvases);
  const canvasesAfterCount = Number(canvasesAfterResult.count);

  const skippedWallCount = wallSeeds.length - insertedWalls.length;
  const skippedCanvasCount = canvasSeeds.length - insertedCanvases.length;

  console.log(`Walls before seed: ${wallsBeforeCount}`);
  console.log(`Inserted walls: ${insertedWalls.length}`);

  if (insertedWalls.length > 0) {
    console.log(
      `Inserted IDs: ${insertedWalls.map((wall) => `${wall.id} (${wall.name})`).join(", ")}`,
    );
  }

  if (skippedWallCount > 0) {
    console.log(`Skipped existing walls: ${skippedWallCount}`);
  }

  console.log(`Walls after seed: ${wallsAfterCount}`);
  console.log(`Canvases before seed: ${canvasesBeforeCount}`);
  console.log(`Inserted canvases: ${insertedCanvases.length}`);

  if (insertedCanvases.length > 0) {
    console.log(
      `Inserted canvas IDs: ${insertedCanvases
        .map((canvas) => `${canvas.id} (${canvas.wallId})`)
        .join(", ")}`,
    );
  }

  if (skippedCanvasCount > 0) {
    console.log(`Skipped existing canvases: ${skippedCanvasCount}`);
  }

  console.log(`Canvases after seed: ${canvasesAfterCount}`);

  console.log("Seed completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });

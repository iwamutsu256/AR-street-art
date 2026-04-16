import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from '../lib/env.js';
import { db, sql } from '../lib/db.js';
import { walls } from './schema.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

const wallSeeds: typeof walls.$inferInsert[] = [
  {
    id: 'demo-wall-1',
    name: 'Tokyo Station Demo Wall',
    latitude: 35.6809591,
    longitude: 139.7673068,
    photoUrl:
      'https://images.unsplash.com/photo-1529429617124-aee711a5ac1c?auto=format&fit=crop&w=800&q=80',
    approxHeading: 180,
    visibilityRadiusM: 40,
  },
  {
    id: 'demo-wall-2',
    name: 'Kanda Demo Shutter',
    latitude: 35.695,
    longitude: 139.77,
    photoUrl:
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
    approxHeading: 90,
    visibilityRadiusM: 40,
  },
];

function formatDatabaseTarget(databaseUrl: string) {
  const { hostname, port, pathname } = new URL(databaseUrl);
  const databaseName = pathname.replace(/^\//, '');
  return `${hostname}${port ? `:${port}` : ''}/${databaseName}`;
}

async function main() {
  console.log(`Seeding database: ${formatDatabaseTarget(env.databaseUrl)}`);
  await migrate(db, { migrationsFolder });

  const [{ count: beforeCount }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM walls
  `;

  const insertedWalls = await db
    .insert(walls)
    .values(wallSeeds)
    .onConflictDoNothing({ target: walls.id })
    .returning({ id: walls.id, name: walls.name });

  const [{ count: afterCount }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM walls
  `;

  const skippedCount = wallSeeds.length - insertedWalls.length;

  console.log(`Walls before seed: ${beforeCount}`);
  console.log(`Inserted walls: ${insertedWalls.length}`);

  if (insertedWalls.length > 0) {
    console.log(
      `Inserted IDs: ${insertedWalls.map((wall) => `${wall.id} (${wall.name})`).join(', ')}`
    );
  }

  if (skippedCount > 0) {
    console.log(`Skipped existing walls: ${skippedCount}`);
  }

  console.log(`Walls after seed: ${afterCount}`);

  console.log('Seed completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });

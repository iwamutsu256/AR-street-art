import { customType, doublePrecision, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Uint8Array }>({
  dataType() {
    return 'bytea';
  },
});

const geography = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

export const walls = pgTable(
  'walls',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    displayAddress: text('display_address'),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    originalImageUrl: text('original_image_url'),
    thumbnailImageUrl: text('thumbnail_image_url'),
    rectifiedImageUrl: text('rectified_image_url'),
    cornerCoordinates: jsonb('corner_coordinates').$type<{ x: number; y: number }[]>().notNull(),
    approxHeading: integer('approx_heading'),
    visibilityRadiusM: integer('visibility_radius_m').notNull().default(30),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    geom: geography('geom'),
  },
  (table) => {
    return {
      geomIndex: index('geom_idx').using('gist', table.geom),
    };
  },
);

export const palettes = pgTable('palettes', {
  version: text('version').primaryKey(),
  name: text('name').notNull(),
  colors: jsonb('colors').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const canvases = pgTable('canvases', {
  id: text('id').primaryKey(),
  wallId: text('wall_id')
    .notNull()
    .references(() => walls.id, { onDelete: 'cascade' }),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  paletteVersion: text('palette_version').notNull().default('v1'),
  pixelData: bytea('pixel_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

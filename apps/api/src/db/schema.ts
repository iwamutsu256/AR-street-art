import { pgTable, text, integer, doublePrecision, timestamp } from 'drizzle-orm/pg-core';

export const walls = pgTable('walls', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  photoUrl: text('photo_url'),
  approxHeading: integer('approx_heading'),
  visibilityRadiusM: integer('visibility_radius_m').notNull().default(30),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const canvases = pgTable('canvases', {
  id: text('id').primaryKey(),
  wallId: text('wall_id').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  paletteVersion: text('palette_version').notNull().default('v1'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

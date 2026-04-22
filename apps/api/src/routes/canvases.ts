import { randomUUID } from 'node:crypto';
import { CANVAS_MAX_SIZE, DEFAULT_PALETTE_VERSION } from '@street-art/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { createBlankPixelData, getCanvasSnapshot } from '../canvas/service.js';
import { canvases, palettes, walls } from '../db/schema.js';
import { db } from '../lib/db.js';

const createCanvasSchema = z.object({
  width: z.preprocess(
    (val) => Number(val),
    z
      .number()
      .int()
      .positive('width must be a positive integer')
      .max(CANVAS_MAX_SIZE, `max width is ${CANVAS_MAX_SIZE}`)
  ),
  height: z.preprocess(
    (val) => Number(val),
    z
      .number()
      .int()
      .positive('height must be a positive integer')
      .max(CANVAS_MAX_SIZE, `max height is ${CANVAS_MAX_SIZE}`)
  ),
  paletteVersion: z.string().min(1).optional().default(DEFAULT_PALETTE_VERSION),
});

export const wallCanvasesApp = new Hono();
export const canvasesApp = new Hono();

wallCanvasesApp.post('/', async (c) => {
  const wallId = c.req.param('wallId');

  if (!wallId) {
    return c.json({ message: 'wallId is required' }, 400);
  }

  const body = await c.req.json();
  const [existingWall] = await db.select({ id: walls.id }).from(walls).where(eq(walls.id, wallId)).limit(1);

  if (!existingWall) {
    return c.json({ message: 'wall not found' }, 404);
  }

  const parsed = createCanvasSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ errors: parsed.error.issues }, 400);
  }

  const { width, height, paletteVersion } = parsed.data;
  const [existingPalette] = await db
    .select({ version: palettes.version })
    .from(palettes)
    .where(eq(palettes.version, paletteVersion))
    .limit(1);

  if (!existingPalette) {
    return c.json({ message: 'palette not found' }, 400);
  }

  try {
    const newCanvasId = randomUUID();
    const [newCanvas] = await db
      .insert(canvases)
      .values({
        id: newCanvasId,
        wallId,
        width,
        height,
        paletteVersion,
        pixelData: createBlankPixelData(width, height),
      })
      .returning();

    const responseData = {
      id: newCanvas.id,
      wallId: newCanvas.wallId,
      width: newCanvas.width,
      height: newCanvas.height,
      paletteVersion: newCanvas.paletteVersion,
      createdAt: newCanvas.createdAt,
      updatedAt: newCanvas.updatedAt,
      message: 'canvas created successfully',
    };

    return c.json(responseData, 201);
  } catch (error) {
    console.error('Failed to create canvas:', error);
    return c.json(
      { message: `Failed to create canvas: ${error instanceof Error ? error.message : 'Unknown error'}` },
      500
    );
  }
});

canvasesApp.get('/:canvasId', async (c) => {
  const canvasId = c.req.param('canvasId');
  const snapshot = await getCanvasSnapshot(canvasId);

  if (!snapshot) {
    return c.json({ message: 'canvas not found' }, 404);
  }

  return c.json(snapshot);
});

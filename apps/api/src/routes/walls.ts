import { randomUUID } from 'node:crypto';
import { CANVAS_MAX_SIZE, DEFAULT_PALETTE_VERSION } from '@street-art/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z, type ZodIssue } from 'zod';
import { createBlankPixelData } from '../canvas/service.js';
import { canvases, walls } from '../db/schema.js';
import { db } from '../lib/db.js';
import { uploadWallImagesToR2 } from '../lib/s3.js';

function parseCornerCoordinates(value: unknown) {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
}

const createWallSchema = z.object({
  name: z.string().min(1, 'name is required'),
  latitude: z.preprocess(
    (val) => Number(val),
    z.number().min(-90).max(90, 'latitude must be between -90 and 90')
  ),
  longitude: z.preprocess(
    (val) => Number(val),
    z.number().min(-180).max(180, 'longitude must be between -180 and 180')
  ),
  approxHeading: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().int().min(0).max(359).optional()
  ),
  visibilityRadiusM: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().int().positive('visibilityRadiusM must be a positive integer').optional().default(30)
  ),
  cornerCoordinates: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      return val;
    },
    z
      .array(
        z.object({
          x: z.preprocess((val) => Number(val), z.number()),
          y: z.preprocess((val) => Number(val), z.number()),
        })
      )
      .length(4, 'cornerCoordinates must be an array of 4 points')
  ),
  canvasWidth: z.preprocess(
    (val) => Number(val),
    z.number().int().positive().max(CANVAS_MAX_SIZE, `canvasWidth must be <= ${CANVAS_MAX_SIZE}`)
  ),
  canvasHeight: z.preprocess(
    (val) => Number(val),
    z.number().int().positive().max(CANVAS_MAX_SIZE, `canvasHeight must be <= ${CANVAS_MAX_SIZE}`)
  ),
});

function isUploadedFile(input: unknown): input is File {
  return typeof input === 'object' && input !== null && 'arrayBuffer' in input && 'type' in input;
}

export const wallsApp = new Hono();

/**
 * 指定された座標から最も近い壁を返す
 */
const nearestWallQuerySchema = z.object({
  lat: z.preprocess(
    (val) => Number(val),
    z.number().min(-90, 'latitude must be >= -90').max(90, 'latitude must be <= 90')
  ),
  lon: z.preprocess(
    (val) => Number(val),
    z.number().min(-180, 'longitude must be >= -180').max(180, 'longitude must be <= 180')
  ),
  radius: z.preprocess(
    (val) => (val ? Number(val) : undefined),
    z.number().int().positive('radius must be a positive integer').optional().default(100)
  ),
});

wallsApp.get('/nearest', async (c) => {
  const query = c.req.query();
  const parsed = nearestWallQuerySchema.safeParse(query);

  if (!parsed.success) {
    return c.json({ errors: parsed.error.issues }, 400);
  }

  const { lat, lon, radius } = parsed.data;

  try {
    // PostGISの関数をDrizzleの`sql`ヘルパーと組み合わせて使用します。
    const distanceInMeters = sql<number>`ST_Distance(geom, ST_MakePoint(${lon}, ${lat})::geography)`.as('distance');

    const result = await db
      .select({
        id: walls.id,
        name: walls.name,
        latitude: walls.latitude,
        longitude: walls.longitude,
        thumbnailImageUrl: walls.thumbnailImageUrl,
        distance: distanceInMeters,
      })
      .from(walls)
      // ST_DWithinを使用して、空間インデックスを活用した効率的な絞り込みを行います。
      .where(sql`ST_DWithin(geom, ST_MakePoint(${lon}, ${lat})::geography, ${radius})`)
      .orderBy(asc(distanceInMeters))
      .limit(1);

    const [nearestWall] = result;

    if (!nearestWall) {
      return c.json(null);
    }

    // `photoUrl`を追加して、レスポンスの形式を他のエンドポイントと統一します。
    const { id, name, latitude, longitude, thumbnailImageUrl, distance } = nearestWall;
    return c.json({ id, name, latitude, longitude, photoUrl: thumbnailImageUrl, distance });
  } catch (error) {
    console.error('Failed to find nearest wall:', error);
    return c.json({ message: 'データベースエラーにより、最も近い壁の検索に失敗しました。' }, 500);
  }
});

/**
 * 壁一覧を返す
 */
wallsApp.get('/', async (c) => {
  // `select()`で全カラムを取得すると、`jsonb`型の`cornerCoordinates`の処理で問題が発生する可能性があるため、
  // レスポンスに必要なカラムのみを明示的に指定して取得します。
  const allWalls = await db
    .select({
      id: walls.id,
      name: walls.name,
      latitude: walls.latitude,
      longitude: walls.longitude,
      thumbnailImageUrl: walls.thumbnailImageUrl,
    })
    .from(walls)
    .orderBy(asc(walls.createdAt));

  const result = allWalls.map((wall) => ({
    id: wall.id,
    name: wall.name,
    latitude: wall.latitude,
    longitude: wall.longitude,
    photoUrl: wall.thumbnailImageUrl,
  }));

  return c.json(result);
});

/**
 * 指定された壁を返す
 */
wallsApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [[row] = [], [canvasRow] = []] = await Promise.all([
    db
      .select({
        id: walls.id,
        name: walls.name,
        latitude: walls.latitude,
        longitude: walls.longitude,
        originalImageUrl: walls.originalImageUrl,
        thumbnailImageUrl: walls.thumbnailImageUrl,
        rectifiedImageUrl: walls.rectifiedImageUrl,
        cornerCoordinates: walls.cornerCoordinates,
        approxHeading: walls.approxHeading,
        visibilityRadiusM: walls.visibilityRadiusM,
        createdAt: walls.createdAt,
      })
      .from(walls)
      .where(eq(walls.id, id))
      .limit(1),
    db
      .select({
        id: canvases.id,
        width: canvases.width,
        height: canvases.height,
        paletteVersion: canvases.paletteVersion,
      })
      .from(canvases)
      .where(eq(canvases.wallId, id))
      .orderBy(asc(canvases.createdAt))
      .limit(1),
  ]);

  if (!row) {
    return c.json({ message: 'Wall not found' }, 404);
  }

  const responseData = {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    originalImageUrl: row.originalImageUrl,
    thumbnailImageUrl: row.thumbnailImageUrl,
    rectifiedImageUrl: row.rectifiedImageUrl,
    cornerCoordinates: parseCornerCoordinates(row.cornerCoordinates),
    approxHeading: row.approxHeading,
    visibilityRadiusM: row.visibilityRadiusM,
    createdAt: row.createdAt,
    photoUrl: row.thumbnailImageUrl,
    canvas: canvasRow ?? null,
  };
  return c.json(responseData);
});

/**
 * 壁を登録する
 */
wallsApp.post('/', async (c) => {
  const body = await c.req.parseBody();
  const allErrors: ZodIssue[] = [];

  // 1. Zodスキーマでテキストフィールドと座標を検証
  const parsed = createWallSchema.safeParse(body);
  if (!parsed.success) {
    allErrors.push(...parsed.error.issues);
  }

  // 2. 画像ファイルを個別に検証し、エラーを収集
  const imageFields = ['originalImageFile', 'thumbnailImageFile', 'rectifiedImageFile'];
  for (const fieldName of imageFields) {
    const file = body[fieldName];

    if (!isUploadedFile(file) || file.size === 0) {
      allErrors.push({
        code: z.ZodIssueCode.custom,
        path: [fieldName],
        message: `A non-empty image file is required for ${fieldName}.`,
      });
    } else if (!file.type.startsWith('image/')) {
      allErrors.push({
        code: z.ZodIssueCode.custom,
        path: [fieldName],
        message: `Unsupported file type for ${fieldName}: ${file.type}.`,
      });
    }
  }

  // 3. エラーが一つでもあれば、すべてまとめて返す
  if (allErrors.length > 0) {
    return c.json({ errors: allErrors }, 400);
  }

  // ここまで来れば、すべてのデータは有効
  const {
    name,
    latitude,
    longitude,
    approxHeading,
    visibilityRadiusM,
    cornerCoordinates,
    canvasWidth,
    canvasHeight,
  } = parsed.data!;
  const originalImageFile = body['originalImageFile'] as File;
  const thumbnailImageFile = body['thumbnailImageFile'] as File;
  const rectifiedImageFile = body['rectifiedImageFile'] as File;

  try {
    const newWallId = randomUUID();

    // 3つのファイルとwallIdを渡してアップロード
    const uploadedUrls = await uploadWallImagesToR2(
      newWallId,
      originalImageFile,
      thumbnailImageFile,
      rectifiedImageFile
    );

    const created = await db.transaction(async (tx) => {
      const [newWall] = await tx
        .insert(walls)
        .values({
          id: newWallId,
          name,
          latitude,
          longitude,
          originalImageUrl: uploadedUrls.originalImageUrl,
          thumbnailImageUrl: uploadedUrls.thumbnailImageUrl,
          rectifiedImageUrl: uploadedUrls.rectifiedImageUrl,
          cornerCoordinates,
          approxHeading,
          visibilityRadiusM,
          geom: sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`,
        })
        .returning();

      const [newCanvas] = await tx
        .insert(canvases)
        .values({
          id: randomUUID(),
          wallId: newWallId,
          width: canvasWidth,
          height: canvasHeight,
          paletteVersion: DEFAULT_PALETTE_VERSION,
          pixelData: createBlankPixelData(canvasWidth, canvasHeight),
        })
        .returning({
          id: canvases.id,
          width: canvases.width,
          height: canvases.height,
          paletteVersion: canvases.paletteVersion,
        });

      return { newWall, newCanvas };
    });

    return c.json(
      {
        ...created.newWall,
        photoUrl: created.newWall.thumbnailImageUrl,
        canvas: created.newCanvas,
        message: 'Wall created successfully',
      },
      201
    );
  } catch (error) {
    console.error('Failed to create wall or upload images:', error);
    return c.json(
      { message: `Failed to create wall: ${error instanceof Error ? error.message : 'Unknown error'}` },
      500
    );
  }
});

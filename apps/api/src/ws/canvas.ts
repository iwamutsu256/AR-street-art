import type { IncomingMessage, Server } from 'node:http';
import { normalizePixelValue, type PixelAppliedMessage } from '@street-art/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import {
  buildCanvasSnapshot,
  DIRTY_CANVAS_SET_KEY,
  ensureRedisReady,
  getCanvasMeta,
  getCanvasMetaKey,
  getCanvasPixelsKey,
  getCanvasState,
  getPaletteColors,
  sanitizePixelBuffer,
  type CanvasMeta,
} from '../canvas/service.js';
import { redis } from '../lib/redis.js';

type CanvasWebSocket = WebSocket & {
  canvasMeta?: CanvasMeta;
};

const canvasConnections = new Map<string, Set<WebSocket>>();

function broadcastToCanvasClients(canvasId: string, message: string) {
  const connections = canvasConnections.get(canvasId);
  if (connections) {
    console.log(`[WS] Broadcasting to ${connections.size} client(s) on canvas ${canvasId}: ${message}`);
    connections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          // 一部のクライアントへの送信に失敗しても、他のクライアントへの送信を続ける
          console.error(`[WS] Failed to send message to a client on canvas ${canvasId}:`, error);
        }
      }
    });
  } else {
    console.log(`[WS] No clients to broadcast to on canvas ${canvasId}.`);
  }
}

const pixelSetSchema = z.object({
  type: z.literal('pixel:set'),
  canvasId: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  color: z.number().int().min(0),
});

const pixelsSetSchema = z.object({
  type: z.literal('pixels:set'),
  canvasId: z.string().min(1),
  pixels: z
    .array(
      z.object({
        x: z.number().int().min(0),
        y: z.number().int().min(0),
        color: z.number().int().min(0),
      })
    )
    .min(1)
    .max(500), // 一度に送信できるピクセル数に上限を設定
});

function sendWebSocketMessage(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export async function handleCanvasUpdate(ws: CanvasWebSocket, canvasId: string, rawMessage: string) {
  try {
    // メタデータを取得。WebSocketセッションでキャッシュされているか、Redisキャッシュから取得
    let meta = ws.canvasMeta;
    if (!meta || meta.id !== canvasId) {
      const newMeta = await getCanvasMeta(canvasId);
      if (newMeta) {
        ws.canvasMeta = newMeta;
        meta = newMeta;
      }
    }

    if (!meta) {
      sendWebSocketMessage(ws, { type: 'error', message: 'Canvas not found' });
      return;
    }

    const parsedJson = JSON.parse(rawMessage);
    const messageType = parsedJson?.type;

    if (messageType === 'pixel:set') {
      const parsedMessage = pixelSetSchema.safeParse(parsedJson);
      if (!parsedMessage.success) {
        sendWebSocketMessage(ws, {
          type: 'error',
          message: 'invalid message format',
          issues: parsedMessage.error.issues,
        });
        return;
      }

      const { canvasId: incomingCanvasId, x, y, color: requestedColor } = parsedMessage.data;
      if (incomingCanvasId !== canvasId) {
        sendWebSocketMessage(ws, { type: 'error', message: 'canvasId does not match the connected canvas' });
        return;
      }

      if (x >= meta.width || y >= meta.height) {
        sendWebSocketMessage(ws, { type: 'error', message: 'Pixel coordinates out of bounds' });
        return;
      }

      const palette = await getPaletteColors(meta.paletteVersion);
      const color = normalizePixelValue(requestedColor, palette.length);
      await ensureRedisReady();
      const updatedAt = new Date().toISOString();
      const offset = y * meta.width + x;

      await redis
        .multi()
        .setrange(getCanvasPixelsKey(canvasId), offset, String.fromCharCode(color))
        .hset(getCanvasMetaKey(canvasId), 'updatedAt', updatedAt)
        .sadd(DIRTY_CANVAS_SET_KEY, canvasId)
        .exec();

      const broadcastPayload: PixelAppliedMessage = { type: 'pixel:applied', canvasId, x, y, color };
      const encodedPayload = JSON.stringify(broadcastPayload);
      broadcastToCanvasClients(canvasId, encodedPayload);
    } else if (messageType === 'pixels:set') {
      const parsedMessage = pixelsSetSchema.safeParse(parsedJson);
      if (!parsedMessage.success) {
        sendWebSocketMessage(ws, {
          type: 'error',
          message: 'invalid message format',
          issues: parsedMessage.error.issues,
        });
        return;
      }

      const { canvasId: incomingCanvasId, pixels } = parsedMessage.data;
      if (incomingCanvasId !== canvasId) {
        sendWebSocketMessage(ws, { type: 'error', message: 'canvasId does not match the connected canvas' });
        return;
      }

      const palette = await getPaletteColors(meta.paletteVersion);
      const validPixels = pixels
        .filter((pixel) => pixel.x < meta.width && pixel.y < meta.height)
        .map((pixel) => ({
          ...pixel,
          color: normalizePixelValue(pixel.color, palette.length),
        }));
      if (validPixels.length === 0) {
        return; // 更新するピクセルがない
      }

      await ensureRedisReady();
      const updatedAt = new Date().toISOString();
      const multi = redis.multi();

      for (const pixel of validPixels) {
        const offset = pixel.y * meta.width + pixel.x;
        // pixel:set と同じ setrange を使用して一貫性を保ち、堅牢性を高める
        multi.setrange(getCanvasPixelsKey(canvasId), offset, String.fromCharCode(pixel.color));
      }

      multi.hset(getCanvasMetaKey(canvasId), 'updatedAt', updatedAt);
      multi.sadd(DIRTY_CANVAS_SET_KEY, canvasId);
      await multi.exec();

      // `PixelsAppliedMessage` に相当するオブジェクトを作成
      const broadcastPayload = {
        type: 'pixels:applied',
        canvasId,
        pixels: validPixels,
      };
      const encodedPayload = JSON.stringify(broadcastPayload);
      broadcastToCanvasClients(canvasId, encodedPayload);
    } else {
      sendWebSocketMessage(ws, { type: 'error', message: `unknown message type: ${messageType}` });
    }
  } catch (error) {
    console.error(`[WS] Error processing message for canvas ${canvasId}:`, error);
    sendWebSocketMessage(ws, { type: 'error', message: 'Failed to process message' });
  }
}

export function createCanvasWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: CanvasWebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathSegments = url.pathname.split('/').filter(Boolean);

    if (pathSegments[0] !== 'ws' || pathSegments[1] !== 'canvases' || !pathSegments[2]) {
      ws.close(1008, 'invalid WebSocket path');
      return;
    }

    const canvasId = pathSegments[2];

    if (!canvasConnections.has(canvasId)) {
      canvasConnections.set(canvasId, new Set());
    }

    canvasConnections.get(canvasId)?.add(ws);
    console.log(
      `[WS] Client connected to canvas: ${canvasId}. Total connections for this canvas: ${canvasConnections.get(canvasId)?.size}`
    );
    // 接続時にキャンバスのスナップショットを送信し、メタデータをキャッシュする
    (async () => {
      const state = await getCanvasState(canvasId);
      if (!state) {
        sendWebSocketMessage(ws, { type: 'error', message: 'Canvas not found' });
        ws.close(1008, 'canvas not found');
        return;
      }
      ws.canvasMeta = state.meta;

      const palette = await getPaletteColors(state.meta.paletteVersion);
      const pixels = sanitizePixelBuffer(state.pixels, palette.length);

      if (pixels !== state.pixels) {
        await Promise.all([
          redis.set(getCanvasPixelsKey(canvasId), pixels),
          redis.sadd(DIRTY_CANVAS_SET_KEY, canvasId),
        ]);
      }

      const snapshot = buildCanvasSnapshot(state.meta, pixels, palette);
      sendWebSocketMessage(ws, snapshot);
    })().catch((error) => console.error(`[WS] Error during connection init for ${canvasId}:`, error));

    ws.on('message', (message) => {
      // 単一または複数のピクセル更新を処理し、Redis経由でブロードキャストする
      void handleCanvasUpdate(ws, canvasId, message.toString());
    });

    ws.on('close', () => {
      const connections = canvasConnections.get(canvasId);
      connections?.delete(ws);

      if (connections?.size === 0) {
        canvasConnections.delete(canvasId);
      }
      console.log(
        `[WS] Client disconnected from canvas: ${canvasId}. Total connections for this canvas: ${connections?.size ?? 0}`
      );
    });

    ws.on('error', (error) => {
      console.error(`[WS] Error on canvas ${canvasId}:`, error);
    });
  });

  console.log('WebSocket server is running.');

  return wss;
}

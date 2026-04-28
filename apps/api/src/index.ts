import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import {
  flushDirtyCanvases,
  startCanvasFlushInterval,
} from "./canvas/service.js";
import { env } from "./lib/env.js";
import { redis } from "./lib/redis.js";
import { createCanvasWebSocketServer } from "./ws/canvas.js";

const app = createApp();
const canvasFlushInterval = startCanvasFlushInterval();

const server = serve(
  {
    fetch: app.fetch,
    port: env.apiPort,
  },
  (info) => {
    console.log(`API server listening on http://localhost:${info.port}`);
  },
);

createCanvasWebSocketServer(server as Server);

let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  clearInterval(canvasFlushInterval);
  await flushDirtyCanvases();

  try {
    if (
      redis.status === "ready" ||
      redis.status === "connect" ||
      redis.status === "wait"
    ) {
      await redis.quit();
    }
  } catch {
    redis.disconnect();
  }
}

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

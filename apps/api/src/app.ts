import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './lib/env.js';
import { registerCanvasRoutes } from './routes/canvases.js';
import { registerRootRoutes } from './routes/root.js';
import { registerWallRoutes } from './routes/walls.js';

export function createApp() {
  const app = new Hono();

  app.use('*', cors({ origin: env.appOrigin, credentials: true }));

  registerRootRoutes(app);
  registerWallRoutes(app);
  registerCanvasRoutes(app);

  return app;
}

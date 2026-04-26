import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './lib/env.js';
import { canvasesApp, wallCanvasesApp } from './routes/canvases.js';
import { rootApp } from './routes/root.js';
import { wallsApp } from './routes/walls.js';

export function createApp() {
  const app = new Hono();

  app.use('*', cors({ origin: env.appOrigin, credentials: true }));

  app.route('/', rootApp);
  app.route('/walls', wallsApp);
  app.route('/walls/:wallId/canvases', wallCanvasesApp);
  app.route('/canvases', canvasesApp);

  return app;
}

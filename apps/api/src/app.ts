import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './lib/env.js';
import { canvasesApp, wallCanvasesApp } from './routes/canvases.js';
import { rootApp } from './routes/root.js';
import { wallsApp } from './routes/walls.js';

export function createApp() {
  const app = new Hono();
  const allowedOrigins = buildAllowedOrigins();

  app.use(
    '*',
    cors({
      origin(origin) {
        const normalizedOrigin = origin.trim().replace(/\/$/, '');

        if (!normalizedOrigin) {
          return null;
        }

        return allowedOrigins.has(normalizedOrigin) ? normalizedOrigin : null;
      },
      credentials: true,
    })
  );

  app.route('/', rootApp);
  app.route('/walls', wallsApp);
  app.route('/walls/:wallId/canvases', wallCanvasesApp);
  app.route('/canvases', canvasesApp);

  return app;
}

function buildAllowedOrigins() {
  const allowedOrigins = new Set<string>();
  const frontendDevPort = (process.env.FRONTEND_DEV_PORT ?? '3000').trim() || '3000';
  const defaultHosts = ['localhost', '127.0.0.1', '::1'];
  const frontendDevHosts = (process.env.FRONTEND_DEV_HOST ?? '')
    .split(',')
    .map((host) => normalizeHost(host))
    .filter(Boolean);

  addOrigin(allowedOrigins, env.appOrigin);

  for (const host of [...defaultHosts, ...frontendDevHosts]) {
    const formattedHost = formatHostForOrigin(host);
    addOrigin(allowedOrigins, `http://${formattedHost}:${frontendDevPort}`);
    addOrigin(allowedOrigins, `https://${formattedHost}:${frontendDevPort}`);
  }

  return allowedOrigins;
}

function addOrigin(allowedOrigins: Set<string>, origin: string) {
  const normalizedOrigin = origin.trim().replace(/\/$/, '');

  if (!normalizedOrigin) {
    return;
  }

  allowedOrigins.add(normalizedOrigin);
}

function normalizeHost(host: string) {
  const trimmedHost = host.trim();

  if (!trimmedHost) {
    return '';
  }

  if (/^https?:\/\//.test(trimmedHost)) {
    return new URL(trimmedHost).hostname;
  }

  if (trimmedHost.startsWith('[') && trimmedHost.endsWith(']')) {
    return trimmedHost.slice(1, -1);
  }

  const ipv6HostWithPortMatch = trimmedHost.match(/^\[([^\]]+)\]:(\d+)$/);

  if (ipv6HostWithPortMatch) {
    return ipv6HostWithPortMatch[1] ?? '';
  }

  const hostWithPortMatch = trimmedHost.match(/^([^:]+):\d+$/);

  if (hostWithPortMatch) {
    return hostWithPortMatch[1] ?? '';
  }

  return trimmedHost;
}

function formatHostForOrigin(host: string) {
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }

  return host;
}

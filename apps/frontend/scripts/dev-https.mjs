#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSelfSignedCertificate } = require('next/dist/lib/mkcert');

const appDir = process.cwd();
const repoRoot = path.resolve(appDir, '..', '..');
const certDirName = 'certificates';
const certDirPath = path.join(appDir, certDirName);

loadEnvFiles([
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(appDir, '.env'),
  path.join(appDir, '.env.local'),
  path.join(appDir, '.env.development'),
  path.join(appDir, '.env.development.local'),
]);

const forwardedArgs = process.argv.slice(2);
const dryRun = forwardedArgs.includes('--dry-run');
const useWebpack = forwardedArgs.includes('--webpack');

const publicHost = normalizeHost(process.env.FRONTEND_DEV_HOST || 'localhost');
const bindHost = (process.env.FRONTEND_DEV_BIND_HOST || '0.0.0.0').trim() || '0.0.0.0';
const port = (process.env.PORT || process.env.FRONTEND_DEV_PORT || '3000').trim() || '3000';

if (!publicHost) {
  console.error('[dev:https] FRONTEND_DEV_HOST must not be empty.');
  process.exit(1);
}

const certificate = await createSelfSignedCertificate(publicHost, certDirName);

if (!certificate) {
  console.error('[dev:https] Failed to prepare a development certificate.');
  process.exit(1);
}

let rootCAPath;

if (certificate.rootCA) {
  rootCAPath = path.join(certDirPath, 'rootCA.pem');
  await fs.copyFile(certificate.rootCA, rootCAPath);
}

const expectedOrigin = `https://${formatHostForUrl(publicHost)}:${port}`;
const resolvedAppOrigin = expectedOrigin;

if (publicHost === 'localhost') {
  console.warn(
    '[dev:https] FRONTEND_DEV_HOST is localhost. Set FRONTEND_DEV_HOST to your LAN IP or local hostname for smartphone testing.'
  );
}

if (resolvedAppOrigin !== process.env.APP_ORIGIN) {
  console.log(`[dev:https] APP_ORIGIN -> ${resolvedAppOrigin}`);
}

console.log(`[dev:https] HTTPS origin: ${expectedOrigin}`);
console.log(`[dev:https] Bind host: ${bindHost}`);
console.log(`[dev:https] Certificate host: ${publicHost}`);

if (rootCAPath) {
  console.log(`[dev:https] Root CA: ${rootCAPath}`);
}

if (dryRun) {
  process.exit(0);
}

const nextArgs = [
  'exec',
  'next',
  'dev',
  '--hostname',
  bindHost,
  '--port',
  port,
  '--experimental-https',
  '--experimental-https-key',
  certificate.key,
  '--experimental-https-cert',
  certificate.cert,
];

if (rootCAPath) {
  nextArgs.push('--experimental-https-ca', rootCAPath);
}

if (useWebpack) {
  nextArgs.push('--webpack');
}

const child = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', nextArgs, {
  cwd: appDir,
  env: {
    ...process.env,
    APP_ORIGIN: resolvedAppOrigin,
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[dev:https] Failed to start Next.js.', error);
  process.exit(1);
});

function loadEnvFiles(files) {
  for (const filePath of files) {
    if (!existsSync(filePath)) {
      continue;
    }

    process.loadEnvFile(filePath);
  }
}

function normalizeHost(host) {
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

  const hostWithPortMatch = trimmedHost.match(/^([^:]+):\d+$/);

  if (hostWithPortMatch) {
    return hostWithPortMatch[1];
  }

  return trimmedHost;
}

function formatHostForUrl(host) {
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }

  return host;
}

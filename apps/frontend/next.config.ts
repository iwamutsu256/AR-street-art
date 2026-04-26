import type { NextConfig } from 'next';

const apiProxyTarget = (process.env.API_PROXY_TARGET ?? 'http://localhost:3001').replace(/\/$/, '');
const allowedDevOrigins = buildAllowedDevOrigins(process.env.FRONTEND_DEV_HOST);
const wsProxyTarget = `${apiProxyTarget}/ws`;

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@street-art/shared'],
  allowedDevOrigins,
  async rewrites() {
    return [
      {
        source: '/ws/:path*',
        destination: `${wsProxyTarget}/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;

function buildAllowedDevOrigins(frontendDevHost: string | undefined) {
  const defaults = ['localhost', '127.0.0.1', '[::1]'];
  const extraHosts = frontendDevHost
    ? frontendDevHost
        .split(',')
        .map((host) => normalizeHost(host))
        .filter(Boolean)
    : [];

  return Array.from(new Set([...defaults, ...extraHosts]));
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
    return trimmedHost;
  }

  const hostWithPortMatch = trimmedHost.match(/^\[([^\]]+)\]:(\d+)$/);

  if (hostWithPortMatch) {
    return `[${hostWithPortMatch[1]}]`;
  }

  const hostPortSeparatorIndex = trimmedHost.lastIndexOf(':');

  if (
    hostPortSeparatorIndex > -1 &&
    trimmedHost.indexOf(':') === hostPortSeparatorIndex &&
    /^\d+$/.test(trimmedHost.slice(hostPortSeparatorIndex + 1))
  ) {
    return trimmedHost.slice(0, hostPortSeparatorIndex);
  }

  return trimmedHost;
}

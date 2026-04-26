import type { NextConfig } from 'next';

const apiProxyTarget = (process.env.API_PROXY_TARGET ?? 'http://localhost:3001').replace(/\/$/, '');

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@street-art/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;

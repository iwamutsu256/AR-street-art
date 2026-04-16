import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@street-art/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://api:3001/:path*',
      },
    ];
  },
};

export default nextConfig;

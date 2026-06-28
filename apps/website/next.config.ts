import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  // Emit folder/index.html so GitHub Pages serves /docs/api/ directly.
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: [
    '@bookkeeprr/tokens',
    '@bookkeeprr/types',
    '@bookkeeprr/ui',
    '@bookkeeprr/logic',
  ],
  images: {
    unoptimized: true,
  },
};

export default config;

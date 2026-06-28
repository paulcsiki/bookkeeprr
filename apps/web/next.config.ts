import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typedRoutes: true,
  // foliate-js is untranspiled native-ESM (private class fields, dynamic
  // imports); transpiling it keeps the production build from choking on it.
  transpilePackages: ['@bookkeeprr/tokens', '@bookkeeprr/types', '@bookkeeprr/ui', 'foliate-js'],
  // `sharp` is an optional dependency consumed via dynamic require in
  // /api/auth/me/avatar/route.ts; mark it external so Turbopack doesn't
  // emit a "Module not found" warning when sharp isn't installed locally.
  serverExternalPackages: ['sharp'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 's4.anilist.co' }],
  },
  // Vendored sign-in cover art is content-stable (keyed by ISBN), so let the
  // browser cache it aggressively. A changed cover would ship under a new file.
  async headers() {
    return [
      {
        source: '/covers/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default config;

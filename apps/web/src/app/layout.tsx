import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ModeProvider } from '@bookkeeprr/ui';
import { apiKeySetting, isApiKeyEnabled } from '@/server/db/settings/api-key';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-mono',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

// TN3156-compliant rich preview metadata. Even though this is a self-hosted
// app, surfacing OG/Twitter cards means a link shared in iMessage / Slack /
// Discord lands as the same bookkeeprr lockup as the marketing site.
const APP_TITLE = 'bookkeeprr';
const APP_DESC = 'Self-hosted media manager for non-video content';

// Without this, mobile Safari renders the page at ~980px and zooms out, which
// breaks responsive media queries (e.g. the login overflowed horizontally).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_DESC,
  applicationName: APP_TITLE,
  openGraph: {
    type: 'website',
    siteName: APP_TITLE,
    title: APP_TITLE,
    description: APP_DESC,
    locale: 'en_US',
    images: [
      {
        url: '/img/og-preview.png',
        type: 'image/png',
        width: 1200,
        height: 630,
        alt: 'bookkeeprr · a reading-room for the *arr stack',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_TITLE,
    description: APP_DESC,
    images: ['/img/og-preview.png'],
  },
  icons: {
    icon: [{ url: '/img/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/img/icon-512.png', sizes: '180x180' }],
    // Static brand violet — mirrors the default --color-primary hsl(263 70% 60%).
    // Metadata can't reference CSS vars, so this is kept in sync by hand.
    other: [{ rel: 'mask-icon', url: '/img/icon-512.png', color: '#8852e0' }],
  },
  appleWebApp: {
    title: APP_TITLE,
    statusBarStyle: 'black-translucent',
  },
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const apiKey = await apiKeySetting.get();
  const metaValue = isApiKeyEnabled(apiKey) ? (apiKey.key ?? '') : '';
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        <meta name="x-api-key" content={metaValue} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ModeProvider>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </ModeProvider>
      </body>
    </html>
  );
}

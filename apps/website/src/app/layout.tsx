import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
});

// TN3156-compliant rich preview for iMessage / Apple Link Presentation:
// Open Graph (with og:image, og:type, og:locale) plus Twitter summary_large_image
// and the apple-mobile-web-app-title hint. Asset specs:
//  - og-preview.png   1200x630 RGBA (the link card hero)
//  - icon-512.png      512x512 RGBA (favicon, touch icon, mask icon)
const SITE_URL = 'https://bookkeeprr.app';
const SITE_TITLE = 'bookkeeprr · a reading-room for the *arr stack';
const SITE_DESC =
  'Self-hosted monitoring & library management for manga, light novels, comics, ebooks, and audiobooks.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description:
    'Self-hosted monitoring & library management for manga, light novels, comics, ebooks, and audiobooks. The *arr-style app the *arr stack forgot.',
  applicationName: 'bookkeeprr',
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'bookkeeprr',
    title: SITE_TITLE,
    description: SITE_DESC,
    locale: 'en_US',
    images: [
      {
        url: '/img/og-preview.png',
        type: 'image/png',
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ['/img/og-preview.png'],
  },
  icons: {
    icon: [{ url: '/img/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/img/icon-512.png', sizes: '180x180' }],
    other: [{ rel: 'mask-icon', url: '/img/icon-512.png', color: '#a98cf0' }],
  },
  appleWebApp: {
    title: 'bookkeeprr',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0e',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}>
      <body className="theme-violet">{children}</body>
    </html>
  );
}

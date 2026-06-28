'use client';

import dynamic from 'next/dynamic';
import '@stoplight/elements/styles.min.css';
import './elements-theme.css';

// Stoplight Elements touches `window` at module scope — client-only, no SSR.
// Its UI layer (mosaic) keeps the resolved theme in a store that Elements
// never initializes — colorValues stays at its `{light: true}` default, so
// the code viewer picks the light prism palette (dark-navy JSON strings) no
// matter how dark the canvas is. subscribeTheme() is the missing
// initializer: it sets the store mode, computes colorValues, and keeps
// <html data-theme> in sync. The site is dark-only: force dark.
const API = dynamic(
  async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const [m, mosaic] = await Promise.all([
      import('@stoplight/elements'),
      import('@stoplight/mosaic'),
    ]);
    mosaic.subscribeTheme({ mode: 'dark' });
    return m.API;
  },
  {
    ssr: false,
    loading: () => (
      <p style={{ color: 'var(--muted)', padding: '48px 24px', textAlign: 'center' }}>
        Loading API reference…
      </p>
    ),
  },
);

export function ApiReference(): React.JSX.Element {
  return (
    <div className="api-reference" data-theme="dark">
      {/* hideTryIt: the published spec points at an example domain, not a
          live server — keep the reference read-only (request/response
          samples stay visible). The webapp's copy keeps TryIt: it talks to
          the instance that serves it. */}
      <API apiDescriptionUrl="/openapi.json" router="hash" layout="sidebar" hideTryIt />
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { useMode } from '@bookkeeprr/ui';
import '@stoplight/elements/styles.min.css';
import './elements-theme.css';

// Stoplight Elements touches `window` at module scope — client-only, no SSR.
// Its UI layer (mosaic) keeps the resolved theme in a store that Elements
// never initializes — colorValues stays at its `{light: true}` default, so
// the code viewer picks the light prism palette (dark-navy JSON strings) no
// matter how dark the canvas is. subscribeTheme() is the missing
// initializer: it sets the store mode, computes colorValues, and keeps
// <html data-theme> in sync. Mirror the app's resolved mode (data-mode, set
// by ModeProvider).
const API = dynamic(
  async () => {
    const mode = document.documentElement.getAttribute('data-mode') === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', mode);
    const [m, mosaic] = await Promise.all([
      import('@stoplight/elements'),
      import('@stoplight/mosaic'),
    ]);
    mosaic.subscribeTheme({ mode });
    return m.API;
  },
  {
    ssr: false,
    loading: () => (
      <p className="p-12 text-center text-muted-foreground">Loading API reference…</p>
    ),
  },
);

export function ApiReference(): React.JSX.Element {
  const { effectiveMode } = useMode();
  return (
    <div className="api-reference" data-theme={effectiveMode}>
      <API apiDescriptionUrl="/api/openapi.json" router="hash" layout="sidebar" />
    </div>
  );
}

import type { JSX } from 'react';

// Reader icon set — ported from reader-core.jsx → READER_ICONS + RIcon.
// Each entry is the inner <path>/<circle>/<rect> markup of a 24×24 viewBox.

const READER_ICONS: Record<string, JSX.Element> = {
  aa: (
    <>
      <path d="M3 19 7.5 6l4.5 13M4.6 14.5h5.8" />
      <path d="M21 19l-2.5-7-2.5 7M16.7 16h3.6" />
    </>
  ),
  textsize: (
    <>
      <path d="M4 7V5h9v2M8.5 5v14M7 19h3" />
      <path d="M14 11V9.5h6V11M17 9.5V19m-1.2 0h2.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  moon: <path d="M20 13a8 8 0 1 1-9-9 6.5 6.5 0 0 0 9 9z" />,
  contrast: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </>
  ),
  brightness: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 4v1.5M12 18.5V20M4 12h1.5M18.5 12H20M6.3 6.3l1 1M16.7 16.7l1 1M17.7 6.3l-1 1M7.3 16.7l-1 1" />
    </>
  ),
  warmth: <path d="M12 3v18M12 3a6 6 0 0 1 0 12 6 6 0 0 1 0-12z" />,
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  expand: <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />,
  shrink: <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" />,
  spread: (
    <>
      <rect x="3" y="5" width="8" height="14" rx="1" />
      <rect x="13" y="5" width="8" height="14" rx="1" />
    </>
  ),
  single: <rect x="6" y="4" width="12" height="16" rx="1" />,
  scroll: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  rtl: <path d="M20 12H4M10 6 4 12l6 6" />,
  ltr: <path d="M4 12h16M14 6l6 6-6 6" />,
  headphones: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="2.5" y="13" width="4.5" height="7" rx="2" />
      <rect x="17" y="13" width="4.5" height="7" rx="2" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  devices: (
    <>
      <rect x="2" y="4" width="14" height="10" rx="1.5" />
      <path d="M6 18h6" />
      <rect x="16" y="9" width="6" height="11" rx="1.5" />
    </>
  ),
};

export function RIcon({
  name,
  size = 18,
  color = 'currentColor',
  stroke = 1.7,
  fill = false,
}: {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
  fill?: boolean;
}): JSX.Element {
  const g = READER_ICONS[name] ?? null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill ? color : 'none'}
      stroke={fill ? 'none' : color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {g}
    </svg>
  );
}

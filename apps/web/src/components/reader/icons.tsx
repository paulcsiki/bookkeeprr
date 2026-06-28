import type { ReactNode } from 'react';

/**
 * READER_ICONS — the reading-specific glyph set ported verbatim from the
 * prototype's `reader-core.jsx`. These are functional UI glyphs (an icon set,
 * not the bookkeeprr Logo), so the inline-SVG rule for the Logo does not apply.
 * Stroke color is inherited via `currentColor` so callers tint through the
 * `--reader-*` tokens.
 */
export const READER_ICONS: Record<string, ReactNode> = {
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
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  ),
  highlight: (
    <>
      <path d="M4 20h6M14 4l6 6-9 9-6-6z" />
      <path d="m13 5 6 6" />
    </>
  ),
  pen: (
    <>
      <path d="M14 4l6 6L8 22H2v-6z" />
      <path d="m12 6 6 6" />
    </>
  ),
  speed: (
    <>
      <path d="M5 19a9 9 0 1 1 14 0" />
      <path d="M12 13l4-4" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13V8.5M9 2h6M12 13l3 2" />
    </>
  ),
  back15: <path d="M12 5V2L8 5l4 3V5a7 7 0 1 1-7 7" />,
  fwd30: <path d="M12 5V2l4 3-4 3V5a7 7 0 1 0 7 7" />,
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
  play: <path d="M7 4v16l13-8z" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>
  ),
  flame: <path d="M12 3c2 5-2 5 0 9a5 5 0 1 1-7 0c1 3 3 2 3-2 0-2-1-3 4-7z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  gauge: (
    <>
      <path d="M5 19a9 9 0 1 1 14 0" />
      <path d="M12 14l5-5" />
      <circle cx="12" cy="14" r="1.3" />
    </>
  ),
  // Three rails with offset knobs — "adjust playback" options (speed / sleep /
  // auto-scroll). Used as the audiobook settings glyph in place of `aa` (which
  // means text size).
  sliders: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="12" r="2.2" />
      <circle cx="14" cy="17" r="2.2" />
    </>
  ),
  devices: (
    <>
      <rect x="2" y="4" width="14" height="10" rx="1.5" />
      <path d="M6 18h6" />
      <rect x="16" y="9" width="6" height="11" rx="1.5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9" />
      <path d="M21 4v5h-5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  quote: (
    <path d="M7 7H4v6h5V9c0-1.5.5-2 2-2V5c-2.5 0-4 .8-4 2zM18 7h-3v6h5V9c0-1.5.5-2 2-2V5c-2.5 0-4 .8-4 2z" />
  ),
};

export type ReaderIconName = keyof typeof READER_ICONS;

export interface RIconProps {
  name: string;
  size?: number;
  /** Stroke/fill color; defaults to `currentColor` so callers tint via tokens. */
  color?: string;
  stroke?: number;
  /** When true the glyph paints filled instead of stroked. */
  fill?: boolean;
}

/** Render a reader glyph by name. Unknown names render an empty svg. */
export function RIcon({
  name,
  size = 18,
  color = 'currentColor',
  stroke = 1.7,
  fill = false,
}: RIconProps) {
  const glyph = READER_ICONS[name] ?? null;
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
      aria-hidden
    >
      {glyph}
    </svg>
  );
}

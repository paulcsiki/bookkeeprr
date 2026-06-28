'use client';

import { useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '../../lib/version';

/**
 * Live mounts of the design system's first mobile + tablet library views.
 *
 *  - `MobLibraryGrid` renders at native 402×874 (iPhone safe area).
 *  - `TabLibraryGrid` renders at native 1180×820 (iPad landscape).
 *
 * Both are CSS-scaled via `transform: scale(N)` to fit the iPad/iPhone
 * screen area inside DeviceShowcase. The scaler measures its parent on
 * mount + resize and computes the scale so the native canvas fits cleanly.
 *
 * Tokens (T.bg, T.primary, etc.) map 1:1 to our website CSS vars; we use
 * `var(--…)` directly rather than threading a JS token object.
 */

/* ───────────────────────────────────────────────────────────────── *
 *  Dataset (verbatim from mobile-screens-library.jsx:5-18)          *
 *  Kafka's ISBN isn't cached locally; the Cover component will fall *
 *  back to its gradient + hatching for that one card.               *
 * ───────────────────────────────────────────────────────────────── */
const SERIES = [
  {
    t: 'Vinland Saga',
    k: 'manga',
    s: 'Vol. 27 · 11.4 GiB',
    hue: 12,
    status: 'ok',
    author: 'Makoto Yukimura',
    isbn: '9781612624204',
  },
  {
    t: 'Re:Zero',
    k: 'novel',
    s: 'Vol. 34 / 38',
    hue: 220,
    status: 'warn',
    author: 'Tappei Nagatsuki',
    isbn: '9780316315302',
  },
  {
    t: 'Saga',
    k: 'comic',
    s: 'Issue 66',
    hue: 60,
    status: 'live',
    author: 'Brian K. Vaughan',
    isbn: '9781607066019',
  },
  {
    t: 'Project Hail Mary',
    k: 'ebook',
    s: 'EPUB · 3.8 MiB',
    hue: 150,
    status: 'ok',
    author: 'Andy Weir',
    isbn: '9780593135204',
  },
  {
    t: 'Three-Body Problem',
    k: 'audio',
    s: 'M4B · 1.7 GiB',
    hue: 300,
    status: 'info',
    author: 'Liu Cixin',
    isbn: '9780765382030',
  },
  {
    t: 'Berserk',
    k: 'manga',
    s: 'Vol. 42 / 42',
    hue: 340,
    status: 'err',
    author: 'Kentaro Miura',
    isbn: '9781506711980',
  },
  {
    t: 'Chainsaw Man',
    k: 'manga',
    s: 'Vol. 16 · ongoing',
    hue: 0,
    status: 'live',
    author: 'Tatsuki Fujimoto',
    isbn: '9781974709939',
  },
  {
    t: 'Spice and Wolf',
    k: 'novel',
    s: 'Vol. 24 / 24',
    hue: 30,
    status: 'ok',
    author: 'Isuna Hasekura',
    isbn: '9780759531048',
  },
  {
    t: 'Monstress',
    k: 'comic',
    s: 'Issue 51',
    hue: 280,
    status: 'ok',
    author: 'Marjorie Liu',
    isbn: '9781632157096',
  },
  {
    t: 'Piranesi',
    k: 'ebook',
    s: 'EPUB · 1.1 MiB',
    hue: 200,
    status: 'ok',
    author: 'Susanna Clarke',
    isbn: '9781635575637',
  },
  {
    t: 'Witch Hat Atelier',
    k: 'manga',
    s: 'Vol. 13 · ongoing',
    hue: 250,
    status: 'live',
    author: 'Kamome Shirahama',
    isbn: '9781632367709',
  },
  {
    t: 'Kafka on the Shore',
    k: 'audio',
    s: 'M4B · 980 MiB',
    hue: 170,
    status: 'warn',
    author: 'Haruki Murakami',
    isbn: '9781400079278',
  },
] as const;
type SeriesKind = 'manga' | 'novel' | 'comic' | 'ebook' | 'audio';
type SeriesStatus = 'ok' | 'warn' | 'err' | 'info' | 'live';
type SeriesItem = (typeof SERIES)[number];
const TYPE_LABEL: Record<SeriesKind, string> = {
  manga: 'Manga',
  novel: 'Light Novel',
  comic: 'Comic',
  ebook: 'eBook',
  audio: 'Audio',
};
const CACHED_ISBNS = new Set([
  '9781612624204',
  '9780316315302',
  '9781607066019',
  '9780593135204',
  '9780765382030',
  '9781506711980',
  '9781974709939',
  '9780759531048',
  '9781632157096',
  '9781635575637',
  '9781632367709',
  '9781421580364',
]);
function coverSrc(isbn?: string): string | null {
  if (!isbn) return null;
  return CACHED_ISBNS.has(isbn) ? `/img/cover-${isbn}.jpg` : null;
}

/* ───────────────────────────────────────────────────────────────── *
 *  Shared primitives                                                *
 * ───────────────────────────────────────────────────────────────── */

function Cover({
  hue,
  isbn,
  title,
  ratio = '2/3',
  children,
}: {
  hue: number;
  isbn?: string;
  title?: string;
  ratio?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const src = coverSrc(isbn);
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: ratio,
        borderRadius: 6,
        overflow: 'hidden',
        background: `linear-gradient(170deg, hsl(${hue} 35% 22%), hsl(${hue} 30% 12%) 60%, hsl(240 10% 6%))`,
        border: '1px solid var(--border-2)',
      }}
    >
      {src && (
         
        <img
          src={src}
          alt=""
          loading="eager"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
      {!src && title && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'hsl(0 0% 100% / 0.55)',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 18,
            letterSpacing: '-0.02em',
            textAlign: 'center',
            padding: 12,
            textShadow: '0 1px 4px hsl(240 30% 4% / 0.7)',
          }}
        >
          {title}
        </span>
      )}
      {children}
    </div>
  );
}

const PILL_COLOR: Record<SeriesKind | 'primary', { fg: string; line: string }> = {
  manga: { fg: 'var(--t-manga)', line: 'oklch(from var(--t-manga) l c h / 0.5)' },
  novel: { fg: 'var(--t-novel)', line: 'oklch(from var(--t-novel) l c h / 0.5)' },
  comic: { fg: 'var(--t-comic)', line: 'oklch(from var(--t-comic) l c h / 0.5)' },
  ebook: { fg: 'var(--t-ebook)', line: 'oklch(from var(--t-ebook) l c h / 0.5)' },
  audio: { fg: 'var(--t-audio)', line: 'oklch(from var(--t-audio) l c h / 0.5)' },
  primary: { fg: 'var(--primary)', line: 'var(--primary-line)' },
};
function Pill({
  kind = 'primary',
  size = 'xs',
  children,
}: {
  kind?: SeriesKind | 'primary';
  size?: 'xs' | 'sm';
  children: React.ReactNode;
}): React.JSX.Element {
  const tone = PILL_COLOR[kind];
  const small = size === 'xs';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: small ? 16 : 20,
        padding: small ? '0 6px' : '0 8px',
        borderRadius: 999,
        fontFamily: 'var(--font-mono)',
        fontSize: small ? 9 : 10,
        fontWeight: 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: tone.fg,
        background: 'var(--bg-elev)',
        border: `1px solid ${tone.line}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function StatusBadge({ kind }: { kind: SeriesStatus }): React.JSX.Element {
  const common = {
    width: 10,
    height: 10,
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const ico =
    kind === 'ok' ? (
      <svg {...common} stroke="var(--ok)">
        <path d="m5 12 4 4L19 6" />
      </svg>
    ) : kind === 'warn' ? (
      <svg {...common} stroke="var(--warn)" strokeWidth={2}>
        <path d="M12 3 22 21H2z" />
        <path d="M12 10v5M12 18v.5" />
      </svg>
    ) : kind === 'err' ? (
      <svg {...common} stroke="var(--err)" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6M15 9l-6 6" />
      </svg>
    ) : kind === 'info' ? (
      <svg {...common} stroke="var(--info)" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 8v.5" />
      </svg>
    ) : (
      <svg {...common} stroke="var(--primary)" strokeWidth={2}>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
      </svg>
    );
  return (
    <span
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 2,
        width: 20,
        height: 20,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        background: 'hsl(0 0% 6% / 0.72)',
        backdropFilter: 'blur(6px)',
        border: '1px solid hsl(0 0% 100% / 0.06)',
      }}
    >
      {ico}
    </span>
  );
}

type IconName =
  | 'search'
  | 'filter'
  | 'chevD'
  | 'chevR'
  | 'plus'
  | 'library'
  | 'compass'
  | 'globe'
  | 'activity'
  | 'download'
  | 'link'
  | 'settings'
  | 'monitor'
  | 'add'
  | 'home'
  | 'list-grid'
  | 'list-rows';

function Icon({
  name,
  size = 16,
  stroke = 1.7,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
}): React.JSX.Element {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'filter':
      return (
        <svg {...common}>
          <path d="M3 4h18l-7 8v6l-4 2v-8z" />
        </svg>
      );
    case 'chevD':
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case 'chevR':
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case 'plus':
    case 'add':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'library':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m15 9-2 6-6 2 2-6z" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...common}>
          <path d="M3 12h4l3-7 4 14 3-7h4" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M10 14 14 10M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 1 1-7-7" />
        </svg>
      );
    case 'monitor':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M9 21h6M12 17v4" />
        </svg>
      );
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-4v-7H8v7H4a1 1 0 0 1-1-1z" />
        </svg>
      );
    case 'list-grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'list-rows':
      return (
        <svg {...common}>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      );
  }
}

function IconButton({
  name,
  badge = false,
}: {
  name: IconName;
  badge?: boolean;
}): React.JSX.Element {
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-grid',
        placeItems: 'center',
        width: 36,
        height: 36,
        borderRadius: 999,
        background: 'var(--bg-elev)',
        border: '1px solid var(--border-2)',
        color: 'var(--fg-soft)',
      }}
    >
      <Icon name={name} size={16} />
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            width: 6,
            height: 6,
            borderRadius: 999,
            background: 'var(--primary)',
          }}
        />
      )}
    </span>
  );
}

const CHIP_TONE: Record<SeriesKind | 'all', { fg: string; bg: string; line: string }> = {
  all: { fg: 'var(--primary)', bg: 'var(--primary-soft)', line: 'var(--primary-line)' },
  manga: {
    fg: 'var(--t-manga)',
    bg: 'oklch(from var(--t-manga) l c h / 0.12)',
    line: 'oklch(from var(--t-manga) l c h / 0.3)',
  },
  novel: {
    fg: 'var(--t-novel)',
    bg: 'oklch(from var(--t-novel) l c h / 0.12)',
    line: 'oklch(from var(--t-novel) l c h / 0.3)',
  },
  comic: {
    fg: 'var(--t-comic)',
    bg: 'oklch(from var(--t-comic) l c h / 0.12)',
    line: 'oklch(from var(--t-comic) l c h / 0.3)',
  },
  ebook: {
    fg: 'var(--t-ebook)',
    bg: 'oklch(from var(--t-ebook) l c h / 0.12)',
    line: 'oklch(from var(--t-ebook) l c h / 0.3)',
  },
  audio: {
    fg: 'var(--t-audio)',
    bg: 'oklch(from var(--t-audio) l c h / 0.12)',
    line: 'oklch(from var(--t-audio) l c h / 0.3)',
  },
};
function Chip({
  active = false,
  kind,
  count,
  children,
}: {
  active?: boolean;
  kind?: SeriesKind;
  count?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const tone = active ? CHIP_TONE.all : kind ? CHIP_TONE[kind] : null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 28,
        padding: '0 12px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        background: tone?.bg ?? 'var(--bg-elev)',
        color: tone?.fg ?? 'var(--fg-soft)',
        border: `1px solid ${tone?.line ?? 'var(--border-2)'}`,
      }}
    >
      {children}
      {count !== undefined && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            opacity: 0.7,
            letterSpacing: '0.04em',
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
}

/* ───────────────────────────────────────────────────────────────── *
 *  Library groups — book-series rows + "New group" affordance        *
 *  (mirrors the shipped Library Groups feature: a New group entry,   *
 *  a Book series section, and an Ungrouped section.)                 *
 * ───────────────────────────────────────────────────────────────── */
type BookSeries = { t: string; k: SeriesKind; count: number; hue: number; isbn?: string };
const BOOK_SERIES: BookSeries[] = [
  { t: 'His Dark Materials', k: 'ebook', count: 3, hue: 200 },
  { t: 'The Old Kingdom', k: 'audio', count: 6, hue: 270 },
  { t: 'Fifty Shades', k: 'ebook', count: 6, hue: 330 },
];

function FolderPlusIcon({ size = 19 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M12 11.5v5M9.5 14h5" />
    </svg>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--muted-2)',
      }}
    >
      {children}
    </div>
  );
}

/** A collapsed multi-book series row: stacked-cover thumb + title + count. */
function BookSeriesRowMock({ d }: { d: BookSeries }): React.JSX.Element {
  const src = coverSrc(d.isbn);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px' }}>
      <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
        <div
          style={{
            position: 'absolute',
            inset: '3px 8px 3px 0',
            borderRadius: 5,
            background: `linear-gradient(170deg, hsl(${d.hue} 28% 16%), hsl(${d.hue} 24% 9%))`,
            border: '1px solid var(--border-2)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '0 0 5px 9px',
            borderRadius: 5,
            overflow: 'hidden',
            border: '1px solid var(--border-2)',
            background: `linear-gradient(170deg, hsl(${d.hue} 35% 22%), hsl(${d.hue} 30% 12%))`,
          }}
        >
          {src && (

            <img
              src={src}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 15,
            color: 'var(--fg)',
            letterSpacing: '-0.01em',
          }}
        >
          {d.t}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--muted-2)',
            letterSpacing: '0.05em',
            marginTop: 3,
            textTransform: 'uppercase',
          }}
        >
          {d.count} books in series
        </div>
      </div>
      <span style={{ color: 'var(--muted-2)', flexShrink: 0 }}>
        <Icon name="chevR" size={16} stroke={1.8} />
      </span>
    </div>
  );
}

/** Tablet book-series card: a cover with a stacked back-edge + books count. */
function BookSeriesCardMock({ d }: { d: BookSeries }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 5,
            right: -5,
            bottom: -5,
            left: 5,
            borderRadius: 6,
            background: `linear-gradient(170deg, hsl(${d.hue} 26% 14%), hsl(${d.hue} 22% 8%))`,
            border: '1px solid var(--border-2)',
          }}
        />
        <Cover hue={d.hue} isbn={d.isbn} title={d.t}>
          <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
            <Pill kind={d.k} size="xs">
              {TYPE_LABEL[d.k]}
            </Pill>
          </span>
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 2,
              display: 'inline-flex',
              alignItems: 'center',
              height: 18,
              padding: '0 7px',
              borderRadius: 999,
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              fontWeight: 500,
              letterSpacing: '0.04em',
              color: '#fff',
              background: 'hsl(0 0% 6% / 0.72)',
              backdropFilter: 'blur(6px)',
              border: '1px solid hsl(0 0% 100% / 0.08)',
            }}
          >
            {d.count}
          </span>
        </Cover>
      </div>
      <div style={{ padding: '0 2px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.005em' }}>
          {d.t}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--muted-2)',
            letterSpacing: '0.05em',
            marginTop: 3,
            textTransform: 'uppercase',
          }}
        >
          {d.count} books in series
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── *
 *  Native MobLibraryGrid (402 × 874) + bottom TabBar                *
 * ───────────────────────────────────────────────────────────────── */

type MobTab = { id: string; label?: string; ico?: IconName; addBtn?: boolean; badge?: boolean };
const MOB_TABS: MobTab[] = [
  { id: 'library', label: 'Library', ico: 'library' },
  { id: 'discover', label: 'Discover', ico: 'compass' },
  { id: 'add', addBtn: true },
  { id: 'activity', label: 'Activity', ico: 'activity', badge: true },
  { id: 'settings', label: 'Settings', ico: 'settings' },
];

function MobTabBar({ active = 'library' }: { active?: string }): React.JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: 28,
        background:
          'linear-gradient(180deg, hsl(240 10% 4% / 0) 0%, hsl(240 10% 4% / 0.95) 30%, hsl(240 10% 4%) 60%)',
        zIndex: 5,
      }}
    >
      <div style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            padding: '8px 8px 6px',
            alignItems: 'flex-start',
          }}
        >
          {MOB_TABS.map((t) =>
            t.addBtn ? (
              <div
                key={t.id}
                style={{ display: 'grid', placeItems: 'center', position: 'relative', height: 50 }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: 'var(--primary)',
                    color: 'var(--primary-fg)',
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 10px 24px -8px var(--primary), 0 0 0 4px var(--bg)',
                    marginTop: -22,
                  }}
                >
                  <Icon name="plus" size={22} stroke={2} />
                </div>
              </div>
            ) : (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 0',
                  height: 50,
                  position: 'relative',
                  color: active === t.id ? 'var(--primary)' : 'var(--muted-2)',
                }}
              >
                <span style={{ position: 'relative' }}>
                  <Icon name={t.ico ?? 'home'} size={20} stroke={1.7} />
                  {t.badge && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -2,
                        right: -4,
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: 'var(--err)',
                        border: '1.5px solid var(--bg)',
                      }}
                    />
                  )}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '-0.005em',
                    color: active === t.id ? 'var(--primary)' : 'var(--muted-2)',
                  }}
                >
                  {t.label}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function MobLibraryGrid(): React.JSX.Element {
  return (
    <div
      style={{
        width: 402,
        height: 874,
        background: 'var(--bg)',
        color: 'var(--fg)',
        fontFamily: 'var(--font-body)',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* iOS status bar */}
      <div
        style={{
          flexShrink: 0,
          height: 44,
          padding: '14px 28px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: '-apple-system, "SF Pro", system-ui',
          fontSize: 15,
          fontWeight: 600,
          color: '#fff',
        }}
      >
        <span>9:41</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <svg width="17" height="11" viewBox="0 0 17 11" aria-hidden="true">
            <path d="M0 9h2v2H0zM4 7h2v4H4zM8 4h2v7H8zM12 1h2v10h-2z" fill="#fff" />
          </svg>
          <svg width="15" height="11" viewBox="0 0 17 12" aria-hidden="true">
            <path
              d="M8.5 1.5C10.8 1.5 12.9 2.4 14.4 3.9L15.5 2.8C13.7 1.0 11.2 0 8.5 0C5.8 0 3.3 1.0 1.5 2.8L2.6 3.9C4.1 2.4 6.2 1.5 8.5 1.5Z"
              fill="#fff"
            />
            <circle cx="8.5" cy="9" r="1.6" fill="#fff" />
          </svg>
          <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
            <rect
              x="0.5"
              y="0.5"
              width="22"
              height="11"
              rx="3"
              stroke="#fff"
              strokeOpacity="0.5"
              fill="none"
            />
            <rect x="2" y="2" width="19" height="8" rx="1.6" fill="#fff" />
            <path d="M24 4v4c.7-.3 1-.9 1-2s-.3-1.7-1-2z" fill="#fff" fillOpacity="0.6" />
          </svg>
        </span>
      </div>

      {/* Scroll body */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* AppBar large */}
        <div style={{ padding: '10px 14px 14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 28,
                  letterSpacing: '-0.025em',
                  lineHeight: 1,
                  color: 'var(--fg)',
                }}
              >
                Library
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                }}
              >
                214 series · 38 monitored · 11 missing
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <IconButton name="search" />
              <IconButton name="filter" badge />
            </div>
          </div>
        </div>

        {/* Chip row */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '0 14px 14px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          <Chip active count={214}>
            All
          </Chip>
          <Chip kind="manga" count={134}>
            Manga
          </Chip>
          <Chip kind="novel" count={41}>
            Light Novel
          </Chip>
          <Chip kind="comic" count={22}>
            Comic
          </Chip>
          <Chip kind="ebook" count={12}>
            eBook
          </Chip>
          <Chip kind="audio" count={5}>
            Audio
          </Chip>
        </div>

        {/* New group affordance */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '4px 14px 12px',
            color: 'var(--primary)',
          }}
        >
          <span style={{ width: 46, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <FolderPlusIcon size={20} />
          </span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>New group…</span>
        </div>

        {/* Book series section */}
        <div style={{ padding: '0 14px 10px' }}>
          <GroupLabel>Book series · {BOOK_SERIES.length}</GroupLabel>
        </div>
        <div
          style={{
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            marginBottom: 18,
          }}
        >
          {BOOK_SERIES.map((b, i) => (
            <div key={b.t} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <BookSeriesRowMock d={b} />
            </div>
          ))}
        </div>

        {/* Ungrouped section header */}
        <div style={{ padding: '0 14px', marginBottom: 12 }}>
          <GroupLabel>Ungrouped · {SERIES.length}</GroupLabel>
        </div>

        {/* 2-column cover grid */}
        <div
          style={{
            padding: '0 14px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            alignItems: 'start',
          }}
        >
          {SERIES.map((d, i) => (
            <MockCoverCard key={i} d={d} index={i} />
          ))}
        </div>

        <div style={{ height: 96 }} />
      </div>
      <MobTabBar active="library" />
    </div>
  );
}

function MockCoverCard({ d, index }: { d: SeriesItem; index: number }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Cover hue={d.hue} isbn={d.isbn} title={d.t}>
        <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
          <Pill kind={d.k as SeriesKind} size="xs">
            {TYPE_LABEL[d.k as SeriesKind]}
          </Pill>
        </span>
        <StatusBadge kind={d.status as SeriesStatus} />
        {d.status === 'live' && (
          <div
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              bottom: 28,
              height: 3,
              borderRadius: 999,
              background: 'hsl(240 5% 22% / 0.6)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${30 + ((index * 7) % 50)}%`,
                height: '100%',
                background: 'var(--primary)',
              }}
            />
          </div>
        )}
      </Cover>
      <div style={{ padding: '0 2px' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--fg)',
            letterSpacing: '-0.005em',
            lineHeight: 1.25,
          }}
        >
          {d.t}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--muted-2)',
            letterSpacing: '0.05em',
            marginTop: 3,
            textTransform: 'uppercase',
          }}
        >
          {d.s}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── *
 *  Native TabLibraryGrid (1180 × 820)                               *
 * ───────────────────────────────────────────────────────────────── */

type NavItem = { id: string; label: string; ico: IconName; count?: number; badge?: boolean };
const NAV_PRIMARY: NavItem[] = [
  { id: 'library', label: 'Library', ico: 'library', count: 214 },
  { id: 'discover', label: 'Discover', ico: 'compass' },
  { id: 'calendar', label: 'Calendar', ico: 'globe' },
  { id: 'activity', label: 'Activity', ico: 'activity', count: 6, badge: true },
];
const NAV_SOURCES: NavItem[] = [
  { id: 'indexers', label: 'Indexers', ico: 'globe', count: 4 },
  { id: 'queue', label: 'Downloads', ico: 'download' },
  { id: 'metadata', label: 'Metadata', ico: 'link' },
];
const NAV_SYSTEM: NavItem[] = [
  { id: 'settings', label: 'Settings', ico: 'settings' },
  { id: 'logs', label: 'Logs', ico: 'monitor' },
];

function TabNavItem({ item, active }: { item: NavItem; active: boolean }): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '9px 12px',
        borderRadius: 8,
        fontSize: 14,
        color: active ? 'var(--primary)' : 'var(--fg-soft)',
        background: active ? 'var(--primary-soft)' : 'transparent',
        position: 'relative',
      }}
    >
      <span style={{ position: 'relative', flexShrink: 0, lineHeight: 0 }}>
        <Icon name={item.ico} size={17} />
        {item.badge && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -3,
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--err)',
            }}
          />
        )}
      </span>
      <span style={{ flex: 1, fontWeight: 500 }}>{item.label}</span>
      {item.count !== undefined && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: active ? 'var(--primary)' : 'var(--muted-2)',
            letterSpacing: '0.04em',
            padding: '1px 6px',
            border: `1px solid ${active ? 'var(--primary-line)' : 'var(--border-2)'}`,
            borderRadius: 999,
          }}
        >
          {item.count}
        </span>
      )}
    </div>
  );
}

function TabSidebar(): React.JSX.Element {
  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        background: 'var(--bg-soft)',
        borderRight: '1px solid var(--border)',
        paddingTop: 36,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="22" height="22" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="30" fill="var(--primary)" />
          <rect x="14" y="22.5" width="32" height="5" rx="1" fill="var(--bg)" />
          <rect x="14" y="30.5" width="36" height="5" rx="1" fill="var(--bg)" />
          <rect x="14" y="38.5" width="22" height="5" rx="1" fill="var(--bg)" />
        </svg>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--fg)',
            letterSpacing: '-0.02em',
          }}
        >
          bookkeep<span style={{ color: 'var(--primary)' }}>rr</span>
        </div>
      </div>
      <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_PRIMARY.map((it) => (
          <TabNavItem key={it.id} item={it} active={it.id === 'library'} />
        ))}
      </div>
      <div
        style={{
          padding: '18px 16px 6px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--muted-2)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        Sources
      </div>
      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_SOURCES.map((it) => (
          <TabNavItem key={it.id} item={it} active={false} />
        ))}
      </div>
      <div
        style={{
          padding: '18px 16px 6px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--muted-2)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        System
      </div>
      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_SYSTEM.map((it) => (
          <TabNavItem key={it.id} item={it} active={false} />
        ))}
      </div>
      <div
        style={{
          marginTop: 'auto',
          padding: '14px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: 'oklch(0.32 0.10 18)',
            color: 'oklch(0.86 0.08 18)',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 500,
            border: '1px solid var(--border-2)',
          }}
        >
          MC
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, color: 'var(--fg)', fontWeight: 500 }}>Maya Chen</div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--muted-2)',
              marginTop: 1,
              letterSpacing: '0.06em',
            }}
          >
            v{APP_VERSION} · 99c4d79
          </div>
        </div>
      </div>
    </aside>
  );
}

function TabLibraryGrid(): React.JSX.Element {
  const featured = SERIES.slice(0, 5);
  return (
    <div
      style={{
        width: 1180,
        height: 820,
        background: 'var(--bg)',
        color: 'var(--fg)',
        fontFamily: 'var(--font-body)',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <TabSidebar />
      <main style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
        {/* iPad status bar (overlay) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 28,
            padding: '6px 24px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: '-apple-system, "SF Pro", system-ui',
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            zIndex: 5,
            pointerEvents: 'none',
          }}
        >
          <span>9:41</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>Wi-Fi</span>
            <svg width="17" height="10" viewBox="0 0 17 10">
              <path
                d="M8.5 1.5C10.8 1.5 12.9 2.4 14.4 3.9L15.5 2.8C13.7 1.0 11.2 0 8.5 0C5.8 0 3.3 1.0 1.5 2.8L2.6 3.9C4.1 2.4 6.2 1.5 8.5 1.5Z"
                fill="#fff"
              />
              <circle cx="8.5" cy="8.5" r="1.5" fill="#fff" />
            </svg>
            <svg width="26" height="11" viewBox="0 0 26 11">
              <rect
                x="0.5"
                y="0.5"
                width="22"
                height="10"
                rx="3"
                stroke="#fff"
                strokeOpacity="0.45"
                fill="none"
              />
              <rect x="2" y="2" width="19" height="7" rx="1.5" fill="#fff" />
            </svg>
          </span>
        </div>

        <div style={{ height: '100%', overflowY: 'auto' }}>
          {/* TopBar (large) */}
          <div style={{ paddingTop: 36, borderBottom: '1px solid var(--border)' }}>
            <div
              style={{
                padding: '16px 28px 18px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 32,
                    letterSpacing: '-0.025em',
                    lineHeight: 1,
                  }}
                >
                  Library
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--muted)',
                    letterSpacing: '0.05em',
                  }}
                >
                  214 SERIES · 38 MONITORED · 11 MISSING · LAST SCAN 2M AGO
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 10,
                    background: 'var(--bg-elev)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg-soft)',
                    fontSize: 13.5,
                    minWidth: 280,
                  }}
                >
                  <Icon name="search" size={14} />
                  <span style={{ flex: 1, color: 'var(--muted-2)' }}>Search the library…</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      color: 'var(--muted-2)',
                      padding: '2px 6px',
                      border: '1px solid var(--border-2)',
                      borderRadius: 4,
                    }}
                  >
                    ⌘K
                  </span>
                </span>
                <div
                  style={{
                    display: 'flex',
                    padding: 3,
                    background: 'var(--bg-elev)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    gap: 2,
                  }}
                >
                  <span
                    style={{
                      padding: '5px 10px',
                      fontSize: 12,
                      fontWeight: 500,
                      background: 'var(--tab-active-bg)',
                      color: 'var(--fg)',
                      borderRadius: 5,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name="list-grid" size={12} />
                    Grid
                  </span>
                  <span
                    style={{
                      padding: '5px 10px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--muted)',
                      borderRadius: 5,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name="list-rows" size={12} />
                    List
                  </span>
                </div>
                <span
                  style={{
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 8,
                    background: 'var(--bg-elev)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg-soft)',
                    fontSize: 13,
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <FolderPlusIcon size={15} />
                  New group
                </span>
                <span
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 8,
                    background: 'var(--primary)',
                    color: 'var(--primary-fg)',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name="plus" size={14} stroke={2.4} />
                  Add new
                </span>
              </div>
            </div>
          </div>

          {/* Filter chips */}
          <div
            style={{
              padding: '14px 28px',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Chip active count={214}>
              All
            </Chip>
            <Chip kind="manga" count={134}>
              Manga
            </Chip>
            <Chip kind="novel" count={41}>
              Light Novel
            </Chip>
            <Chip kind="comic" count={22}>
              Comic
            </Chip>
            <Chip kind="ebook" count={12}>
              eBook
            </Chip>
            <Chip kind="audio" count={5}>
              Audiobook
            </Chip>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--muted)',
                letterSpacing: '0.06em',
              }}
            >
              SORT · RECENTLY ADDED ↓
            </span>
          </div>

          {/* Continue reading row */}
          <div style={{ padding: '12px 28px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  letterSpacing: '0.14em',
                  color: 'var(--muted-2)',
                  textTransform: 'uppercase',
                }}
              >
                Continue reading · 5
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 12,
                  color: 'var(--primary)',
                  fontWeight: 500,
                }}
              >
                See all →
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 14,
              }}
            >
              {featured.map((d, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12,
                    background: `linear-gradient(180deg, hsl(${d.hue} 30% 12%), hsl(240 10% 6%))`,
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ width: 60, flexShrink: 0 }}>
                    <Cover hue={d.hue} isbn={d.isbn} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Pill kind={d.k as SeriesKind} size="xs">
                      {TYPE_LABEL[d.k as SeriesKind]}
                    </Pill>
                    <div
                      style={{
                        marginTop: 6,
                        fontFamily: 'var(--font-display)',
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--fg)',
                        letterSpacing: '-0.01em',
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {d.t}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        color: 'var(--muted-2)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Vol · {20 + i * 2}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        height: 3,
                        borderRadius: 999,
                        background: 'var(--tab-active-bg)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${20 + i * 15}%`,
                          height: '100%',
                          background: 'var(--primary)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Book series section */}
          <div style={{ padding: '20px 28px 0' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                letterSpacing: '0.14em',
                color: 'var(--muted-2)',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Book series · {BOOK_SERIES.length}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 16,
                alignItems: 'start',
              }}
            >
              {BOOK_SERIES.map((b) => (
                <BookSeriesCardMock key={b.t} d={b} />
              ))}
            </div>
          </div>

          {/* Main grid (ungrouped) */}
          <div style={{ padding: '24px 28px 0' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                letterSpacing: '0.14em',
                color: 'var(--muted-2)',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Ungrouped · 211
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 16,
                alignItems: 'start',
              }}
            >
              {SERIES.map((d, i) => (
                <MockCoverCard key={i} d={d} index={i} />
              ))}
            </div>
          </div>

          <div style={{ height: 40 }} />
        </div>
      </main>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── *
 *  Scaler containers — wrap the native canvas + transform: scale()  *
 * ───────────────────────────────────────────────────────────────── */

/**
 * Centers a native-sized canvas inside its container by computing the
 * largest scale that fits both axes (object-fit: contain semantics) and
 * laying out a sized wrapper that exactly matches the visual rect so
 * flexbox centering works against the *scaled* dimensions, not the raw
 * native ones. This is what eliminates the top-anchored / bottom-cropped
 * look that you get with `transform-origin: top left` + width-only fit.
 */
function FitScale({
  width,
  height,
  className,
  children,
}: {
  width: number;
  height: number;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (): void => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw > 0 && ch > 0) setScale(Math.min(cw / width, ch / height));
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, [width, height]);
  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: width * scale,
          height: height * scale,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function MobLibraryGridMock(): React.JSX.Element {
  return (
    <FitScale width={402} height={874} className="phone-mock-mount">
      <MobLibraryGrid />
    </FitScale>
  );
}

export function TabLibraryGridMock(): React.JSX.Element {
  return (
    <FitScale width={1180} height={820} className="tablet-mock-mount">
      <TabLibraryGrid />
    </FitScale>
  );
}

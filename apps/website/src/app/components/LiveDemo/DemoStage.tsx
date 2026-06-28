'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { openLibraryCoverUrl } from '@bookkeeprr/logic';
import { APP_VERSION } from '../../../lib/version';
import type { Phase } from './useDemoMachine';

/**
 * Cover-card subtitle that shrinks its font-size to stay on one line instead
 * of wrapping. The added card's "GRABBING V28 · 62% · 198 MIB" string is wider
 * than the column; wrapping would make that card taller and bump the grid row.
 * We force nowrap and step the font down until the text fits (or hits the floor).
 */
const SUB_MAX_FONT = 9.5;
const SUB_MIN_FONT = 6.5;
function CoverSub({ text }: { text: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState(SUB_MAX_FONT);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (): void => {
      let size = SUB_MAX_FONT;
      el.style.fontSize = `${size}px`;
      while (size > SUB_MIN_FONT && el.scrollWidth > el.clientWidth) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
      setFont(size);
    };
    fit();
    const obs = new ResizeObserver(fit);
    obs.observe(el);
    return () => obs.disconnect();
  }, [text]);
  return (
    <div
      ref={ref}
      className="sub"
      style={{ whiteSpace: 'nowrap', overflow: 'hidden', fontSize: font }}
    >
      {text}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VINLAND_ISBN = '9781612624204';

const SERIES = [
  { t: 'Berserk', k: 'manga', isbn: '9781506711980', hue: 340, s: 'V42 / 42', status: 'err' },
  {
    t: 'Chainsaw Man',
    k: 'manga',
    isbn: '9781974709939',
    hue: 0,
    s: 'V16 · ONGOING',
    status: 'live',
  },
  { t: 'Re:Zero', k: 'novel', isbn: '9780316315302', hue: 220, s: 'V34 / 38', status: 'warn' },
  { t: 'Saga', k: 'comic', isbn: '9781607066019', hue: 60, s: 'ISSUE 66', status: 'live' },
  {
    t: 'Project Hail Mary',
    k: 'ebook',
    isbn: '9780593135204',
    hue: 150,
    s: 'EPUB · 3.8 MIB',
    status: 'ok',
  },
  {
    t: 'Three-Body Problem',
    k: 'audio',
    isbn: '9780765382030',
    hue: 300,
    s: 'M4B · 1.7 GIB',
    status: 'info',
  },
  {
    t: 'Witch Hat Atelier',
    k: 'manga',
    isbn: '9781632367709',
    hue: 250,
    s: 'V13 · ONGOING',
    status: 'live',
  },
  { t: 'Spice and Wolf', k: 'novel', isbn: '9780759531048', hue: 30, s: 'V24 / 24', status: 'ok' },
  { t: 'Monstress', k: 'comic', isbn: '9781632157096', hue: 280, s: 'ISSUE 51', status: 'ok' },
  { t: 'Piranesi', k: 'ebook', isbn: '9781635575637', hue: 200, s: 'EPUB · 1.1 MIB', status: 'ok' },
  {
    t: 'Kafka on the Shore',
    k: 'audio',
    isbn: '9781400079278',
    hue: 170,
    s: 'M4B · 980 MIB',
    status: 'warn',
  },
  // 11 covers in steady state (matches the design). The prepended Vinland
  // Saga card fills the 12th slot → 2 full rows of 6, so adding it never
  // grows the grid by a row.
] as const;

const KIND_LABELS: Record<string, string> = {
  manga: 'Manga',
  novel: 'Novel',
  comic: 'Comic',
  ebook: 'eBook',
  audio: 'Audio',
};

// Detail-view volumes — Vinland Saga 21-28. Cover art mirrored locally
// from MangaDex (volumes 21-28 are publicly available on their CDN).
const VOLUMES = [
  { n: 28, isNew: true },
  { n: 27 },
  { n: 26 },
  { n: 25 },
  { n: 24 },
  { n: 23 },
  { n: 22 },
  { n: 21 },
] as const;
function volumeCoverSrc(n: number): string {
  return `/img/vinland-vol-${n}.jpg`;
}

// ─── Status badge SVGs ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const _shared =
    'width="10" height="10" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  switch (status) {
    case 'ok':
      return (
        <span className="status-badge">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ok)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
        </span>
      );
    case 'warn':
      return (
        <span className="status-badge">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--warn)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3 22 21H2z" />
            <path d="M12 10v5M12 18v.5" />
          </svg>
        </span>
      );
    case 'err':
      return (
        <span className="status-badge">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--err)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m9 9 6 6M15 9l-6 6" />
          </svg>
        </span>
      );
    case 'info':
      return (
        <span className="status-badge">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--info)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6M12 8v.5" />
          </svg>
        </span>
      );
    case 'live':
      return (
        <span className="status-badge">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
          </svg>
        </span>
      );
    default:
      return <></>;
  }
}

// ─── Added-card overlay ────────────────────────────────────────────────────────

function AddedOverlay({ phase }: { phase: Phase }): React.JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Trigger the grab-bar CSS transition via rAF when grabbing starts
  useEffect(() => {
    if (phase === 'grabbing' && overlayRef.current) {
      const el = overlayRef.current;
      requestAnimationFrame(() => {
        el.classList.add('show-bar');
      });
    }
  }, [phase]);

  if (phase === 'added') {
    return (
      <div className="added-overlay" ref={overlayRef}>
        <span className="spinner" />
      </div>
    );
  }
  if (phase === 'grabbing') {
    return (
      <div className="added-overlay" ref={overlayRef}>
        <div className="grab-bar">
          <span />
        </div>
      </div>
    );
  }
  if (phase === 'imported' || phase === 'detail' || phase === 'complete') {
    return (
      <div className="added-overlay imported" ref={overlayRef}>
        <span className="checkmark">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
        </span>
      </div>
    );
  }
  return <></>;
}

// ─── Added card sub-text per phase ────────────────────────────────────────────

function addedCardSub(phase: Phase): string {
  if (phase === 'grabbing') return 'GRABBING V28 · 62% · 198 MIB';
  if (phase === 'imported' || phase === 'detail' || phase === 'complete')
    return 'IMPORTED · V28 · 461 MIB';
  return 'MONITORING · SEARCHING…';
}

// ─── Sub-header text per phase ────────────────────────────────────────────────

function demoSub(phase: Phase): string {
  switch (phase) {
    case 'idle':
      return '214 series · 38 monitored · 11 missing';
    case 'typing':
      return 'searching…';
    case 'empty':
      return '0 results in your library · search sources?';
    case 'dialog':
      return '1 match on MangaDex + AniList';
    case 'added':
      return '215 series · 39 monitored · added vinland saga';
    case 'grabbing':
      return 'grabbing v28 · 198 / 318 mib · 12 seeders';
    case 'imported':
      return '215 series · vinland saga v28 imported';
    case 'detail':
      return 'series detail · loading volumes…';
    case 'complete':
      return 'series detail · loading volumes…';
  }
}

// ─── Phase label per phase ────────────────────────────────────────────────────

const PHASE_LABELS: Record<Phase, { num: string; name: string }> = {
  idle: { num: '01', name: 'browsing the library' },
  typing: { num: '02', name: 'searching · vinland saga' },
  empty: { num: '03', name: 'not in library · request?' },
  dialog: { num: '04', name: 'matched on anilist + mdex' },
  added: { num: '05', name: 'monitoring · searching releases' },
  grabbing: { num: '06', name: 'grabbing v28 · nyaa · 12 seeds' },
  imported: { num: '07', name: 'imported · v28 · 461 mib' },
  detail: { num: '08', name: 'series detail · loading volumes' },
  complete: { num: '08', name: 'series detail · loading volumes' },
};

// ─── Progress segment index ────────────────────────────────────────────────────

const PHASE_ORDER: Phase[] = [
  'idle',
  'typing',
  'empty',
  'dialog',
  'added',
  'grabbing',
  'imported',
  'detail',
];

function phaseIndex(phase: Phase): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx === -1 ? PHASE_ORDER.length - 1 : idx;
}

// ─── Durations for progress bar CSS var ───────────────────────────────────────

const PHASE_DURS: Record<Phase, number> = {
  idle: 1500,
  typing: 2400,
  empty: 1700,
  dialog: 2400,
  added: 1800,
  grabbing: 2600,
  imported: 1600,
  detail: 3800,
  complete: 3800,
};

// ─── DemoStage ────────────────────────────────────────────────────────────────

interface DemoStageProps {
  phase: Phase;
}

export function DemoStage({ phase }: DemoStageProps): React.JSX.Element {
  const phaseIdx = phaseIndex(phase);
  const label = PHASE_LABELS[phase];

  // Computed booleans for class toggling
  const gridDim = phase === 'empty' || phase === 'dialog';
  const showEmpty = phase === 'empty';
  const showDialog = phase === 'dialog';
  const showToast = phase === 'imported';
  const showDetail = phase === 'detail' || phase === 'complete';
  const showAddedCard =
    phase === 'added' ||
    phase === 'grabbing' ||
    phase === 'imported' ||
    phase === 'detail' ||
    phase === 'complete';

  // Sidebar counts
  const libCount =
    phase === 'idle' || phase === 'typing' || phase === 'empty' || phase === 'dialog'
      ? '214'
      : '215';
  const actCount =
    phase === 'idle' || phase === 'typing' || phase === 'empty' || phase === 'dialog' ? '6' : '7';

  return (
    <>
      {/* ── Sidebar ── */}
      <aside className="side">
        <div className="side-item active" data-tab="library">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
          Library
          <span className="count">{libCount}</span>
        </div>
        <div className="side-item" data-tab="discover">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m15 9-2 6-6 2 2-6z" />
          </svg>
          Discover
        </div>
        <div className="side-item" data-tab="calendar">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Calendar
        </div>
        <div className="side-item" data-tab="activity">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12h4l3-7 4 14 3-7h4" />
          </svg>
          Activity
          <span className="count">{actCount}</span>
        </div>

        <div className="group">SOURCES</div>
        <div className="side-item">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
          Indexers
          <span className="count">4</span>
        </div>
        <div className="side-item">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v18M3 12h18" />
          </svg>
          Download client
        </div>

        <div className="group">SYSTEM</div>
        <div className="side-item">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19 12a7 7 0 1 1-7-7" />
          </svg>
          Settings
        </div>

        <div
          style={{
            marginTop: 'auto',
            padding: '14px 8px 0',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--muted)',
            fontSize: '12px',
          }}
        >
          <span
            className="live-dot"
            style={{
              background: 'var(--ok)',
              boxShadow: '0 0 0 2px oklch(from var(--ok) l c h / 0.2)',
              animation: 'none',
            }}
          />
          <div>
            <div style={{ color: 'var(--fg-soft)', fontSize: '12.5px' }}>Worker online</div>
            <div className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)' }}>
              v{APP_VERSION} · scanned 2m ago
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="demo-main">
        {/* Header */}
        <div className="demo-head">
          <div>
            <div className="ttl">Library</div>
            <div className="sub">{demoSub(phase)}</div>
          </div>
          <div className="search-input" style={{ position: 'relative' }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="typewriter">
              <span>
                {phase === 'typing' || phase === 'empty' || phase === 'dialog'
                  ? 'vinland saga'
                  : ''}
              </span>
              <span className="cursor" />
            </span>
            <span className="kbd">⌘K</span>
            <span className="demo-phase-label">
              <span className="num">{label.num}</span>
              <span>{label.name}</span>
            </span>
          </div>
        </div>

        {/* Chips */}
        <div className="chip-row" style={{ pointerEvents: 'none' }}>
          <span className="chip active">
            All <span className="count">214</span>
          </span>
          <span className="chip">
            Manga <span className="count">134</span>
          </span>
          <span className="chip">
            Light Novel <span className="count">41</span>
          </span>
          <span className="chip">
            Comic <span className="count">22</span>
          </span>
          <span className="chip">
            eBook <span className="count">12</span>
          </span>
          <span className="chip">
            Audio <span className="count">5</span>
          </span>
        </div>

        {/* Stage */}
        <div className="demo-stage">
          {/* Library grid */}
          <div className={`demo-grid${gridDim ? ' dim' : ''}`}>
            {/* Vinland Saga added-card — shown from 'added' onward */}
            {showAddedCard && (
              <div
                className="cover-card added-card"
                style={{ animation: 'addedSlideIn 0.4s ease both' }}
              >
                <div
                  className="cover has-img"
                  style={{
                    background: 'linear-gradient(160deg, hsl(12 35% 22%), hsl(12 30% 12%))',
                  }}
                >
                  {/* Plain <img> (absolute-filled via the `.cover img` rule)
                      rather than next/image fill — fill mis-sizes inside the
                      animated/transformed added-card and stretched the cover. */}
                  { }
                  <img
                    src={openLibraryCoverUrl(VINLAND_ISBN, 'L', { default: false })}
                    alt="Vinland Saga cover"
                    loading="eager"
                  />
                  <span className="pill manga">Manga</span>
                  <AddedOverlay phase={phase} />
                </div>
                <div className="meta">
                  <div className="name">Vinland Saga</div>
                  <CoverSub text={addedCardSub(phase)} />
                </div>
              </div>
            )}

            {/* Static library covers (11). The animated progress strip lives only on
                the Vinland added-card so the eye is drawn to the actual demo flow;
                static cards keep the small status badge but no bottom bar. The added
                card prepends to make 12 = 2 full rows, so the grid never grows. */}
            {SERIES.map((d) => (
              <div key={d.t} className="cover-card">
                <div
                  className="cover has-img"
                  style={{
                    background: `linear-gradient(160deg, hsl(${d.hue} 35% 22%), hsl(${d.hue} 30% 12%) 60%, hsl(240 10% 6%))`,
                  }}
                >
                  { }
                  <img
                    src={openLibraryCoverUrl(d.isbn, 'L', { default: false })}
                    alt={d.t}
                    loading="eager"
                  />
                  <span className={`pill ${d.k}`}>{KIND_LABELS[d.k]}</span>
                  <StatusBadge status={d.status} />
                  <span className="title">{d.t}</span>
                </div>
                <div className="meta">
                  <div className="name">{d.t}</div>
                  <CoverSub text={d.s} />
                </div>
              </div>
            ))}
          </div>

          {/* Empty-results prompt */}
          <div className={`demo-empty${showEmpty ? ' show' : ''}`}>
            <div className="ico">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </div>
            <div>
              <div className="ttl">Not in your library</div>
              <div className="sub">
                Search MangaDex, AniList &amp; OpenLibrary for &ldquo;vinland saga&rdquo;?
              </div>
            </div>
            <button className="cta" type="button">
              Find it →
            </button>
          </div>

          {/* Request dialog */}
          <div className={`demo-dialog${showDialog ? ' show' : ''}`}>
            <div className="head">
              <div className="ico">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </div>
              <div>
                <div className="ttl">Add to library</div>
                <div className="sub">1 match · MangaDex + AniList</div>
              </div>
            </div>
            <div className="body">
              <div className="result">
                <div className="cv">
                  <Image
                    src={openLibraryCoverUrl(VINLAND_ISBN, 'L', { default: false })}
                    alt="Vinland Saga"
                    fill
                    sizes="60px"
                    style={{ objectFit: 'cover' }}
                    unoptimized
                  />
                </div>
                <div className="info">
                  <div className="ttl">Vinland Saga</div>
                  <div className="bl">Makoto Yukimura · 2005, ongoing · 27 vol</div>
                  <div className="meta">
                    <span className="pill manga">Manga</span>
                    <span
                      className="mono"
                      style={{ fontSize: '10px', color: 'var(--muted-2)', letterSpacing: '0.04em' }}
                    >
                      anilist:101517
                    </span>
                  </div>
                </div>
                <button className="cta" type="button">
                  Add
                </button>
              </div>
            </div>
            <div className="foot">
              <span>quality · cbz hq</span>
              <span>auto-grab on availability ✓</span>
            </div>
          </div>

          {/* Detail view */}
          <div className={`demo-detail${showDetail ? ' show' : ''}`}>
            <div className="crumbs">
              <span style={{ color: 'var(--primary)' }}>←</span> Library
              <span className="sep">/</span>
              Manga
              <span className="sep">/</span>
              <span style={{ color: 'var(--fg)' }}>Vinland Saga</span>
            </div>
            <div className="hero">
              <div className="cv has-img">
                <Image
                  src={openLibraryCoverUrl(VINLAND_ISBN, 'L', { default: false })}
                  alt="Vinland Saga"
                  fill
                  sizes="120px"
                  style={{ objectFit: 'cover' }}
                  unoptimized
                />
              </div>
              <div className="info">
                <div className="pillrow">
                  <span className="pill manga">Manga</span>
                  <span
                    className="live-dot"
                    style={{
                      background: 'var(--ok)',
                      boxShadow: '0 0 0 2px oklch(from var(--ok) l c h / 0.2)',
                      animation: 'none',
                    }}
                  />
                  <span
                    className="mono"
                    style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.04em' }}
                  >
                    MONITORED · ANILIST:101517 · MDEX:F9C0…
                  </span>
                </div>
                <div className="ttl">Vinland Saga</div>
                <div className="byline">Makoto Yukimura · 2005, ongoing · Kodansha</div>
                <div className="actions">
                  <button className="primary" type="button">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2z" />
                      <path d="M22 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22z" />
                    </svg>
                    Read now
                  </button>
                  <button className="secondary" type="button">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    Interactive search
                  </button>
                  <button className="secondary" type="button">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 15V9a6 6 0 0 1 12 0v6" />
                      <path d="M3 9h6v3H3zM15 9h6v3h-6z" />
                    </svg>
                    Add manually
                  </button>
                  <button className="secondary" type="button">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 4h6l2 2h2v3M3 4v8M3 12h7M10 12v4h4M14 9h7v4h-7zM14 16h7v4h-7z" />
                    </svg>
                    Organize
                  </button>
                </div>
              </div>
            </div>
            {/* Tabbed nav — mirrors the real series-detail control
                (Overview / Volumes / Releases / Settings) with Volumes active. */}
            <div
              style={{
                display: 'flex',
                gap: 2,
                borderBottom: '1px solid var(--border)',
                marginTop: 4,
              }}
            >
              {[
                { l: 'Overview' },
                { l: 'Volumes', n: '27', active: true },
                { l: 'Releases' },
                { l: 'Settings' },
              ].map((tb) => (
                <span
                  key={tb.l}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '9px 13px',
                    fontSize: 13,
                    fontWeight: 500,
                    color: tb.active ? 'var(--fg)' : 'var(--muted)',
                    borderBottom: `2px solid ${tb.active ? 'var(--primary)' : 'transparent'}`,
                    marginBottom: -1,
                  }}
                >
                  {tb.l}
                  {tb.n && (
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: tb.active ? 'var(--primary)' : 'var(--muted-2)',
                      }}
                    >
                      {tb.n}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="stats">
              <div className="stat">
                <div className="k">VOLUMES</div>
                <div className="v">
                  8<small>/27</small>
                </div>
              </div>
              <div className="stat">
                <div className="k">SIZE</div>
                <div className="v">
                  3.7<small>GiB</small>
                </div>
              </div>
              <div className="stat">
                <div className="k">PROFILE</div>
                <div className="v text">CBZ HQ</div>
              </div>
              <div className="stat">
                <div className="k">NEXT</div>
                <div className="v text">Q3 &apos;26</div>
              </div>
            </div>
            <div className="vol-head">
              <span className="label">Volumes · sorted newest first</span>
              <span className="progress-text">
                8 of 27 imported · 19 missing · run interactive search →
              </span>
            </div>
            <div className="volumes">
              {VOLUMES.map((v) => (
                <div
                  key={v.n}
                  className={`vol${'isNew' in v && v.isNew ? ' new' : ''} show`}
                  data-vol={v.n}
                  style={{
                    background: `linear-gradient(170deg, hsl(${12 + (28 - v.n) * 3} 35% 22%), hsl(${12 + (28 - v.n) * 3} 30% 12%))`,
                  }}
                >
                  <Image
                    src={volumeCoverSrc(v.n)}
                    alt={`Vinland Saga volume ${v.n}`}
                    fill
                    sizes="60px"
                    style={{ objectFit: 'cover' }}
                    unoptimized
                  />
                  <span className="label">VOL {String(v.n).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Toast */}
          <div className={`demo-toast${showToast ? ' show' : ''}`}>
            <div className="ico">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>
            <div>
              <div className="ttl">Vinland Saga v28 imported</div>
              <div className="sub">461 MIB · /MEDIA/MANGA · 3.2S</div>
            </div>
          </div>
        </div>

        {/* Progress segments */}
        <div className="demo-progress">
          {PHASE_ORDER.map((p, i) => (
            <span
              key={p}
              className={`seg${i < phaseIdx ? ' done' : i === phaseIdx ? ' active' : ''}`}
              style={
                i === phaseIdx
                  ? ({ '--dur': `${PHASE_DURS[phase]}ms` } as React.CSSProperties)
                  : undefined
              }
            >
              <span className="fill" />
            </span>
          ))}
        </div>
      </main>
    </>
  );
}

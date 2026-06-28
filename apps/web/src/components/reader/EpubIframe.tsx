'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { SpineItem } from '@bookkeeprr/types';
import { entryPathFor, fontStack } from './lib/text-settings';
import { epubColumnPageCount } from './lib/position';
import type { ReaderFontKey, ReaderPageMode } from './SettingsSheet';

export interface EpubIframeProps {
  fileId: number;
  /** The OPF directory, joined with the spine href to address the zip entry. */
  opfDir: string | undefined;
  /** The spine item currently being rendered. */
  item: SpineItem;
  /** Paged (CSS multi-column) or continuous scroll. */
  pageMode: ReaderPageMode;
  fontKey: ReaderFontKey;
  fontSize: number;
  lineH: number;
  /** 0-based page within this spine item (paged mode only). */
  page: number;
  /** Reports the measured page count for this spine item. */
  onPageCount: (count: number) => void;
  /** Tap-zone navigation: a click resolved to prev / next / toggle chrome. */
  onTap: (action: 'prev' | 'next' | 'toggle') => void;
  /** Scroll-mode position reporting, 0..1 within this item. */
  onScrollPos?: (pos: number) => void;
  /** Seed the scroll offset to this 0..1 position when entering scroll mode. */
  scrollSeed?: number;
  /**
   * The active reader page-theme key. The `--reader-*` custom properties live
   * on the parent's `data-reader-theme` element and do NOT cross into the
   * iframe's separate document, so we resolve them from the parent and inject
   * literal values. This prop is part of the re-apply trigger so a theme
   * switch re-injects the resolved colors.
   */
  themeKey: string;
}

/** The `--reader-*` custom properties we mirror into the iframe document. */
const READER_VARS = [
  '--reader-ink',
  '--reader-ink-soft',
  '--reader-faint',
  '--reader-page',
  '--reader-accent',
  '--reader-line',
  '--reader-sel',
] as const;

const GAP = 56;
/** Body horizontal padding (left + right) — kept in sync with the injected CSS. */
const PAD_X = 48;

/** Build the resource URL for a spine item's html. */
function resourceUrl(fileId: number, opfDir: string | undefined, href: string): string {
  const entry = entryPathFor(opfDir, href);
  return `/api/reader/epub/${fileId}/resource?path=${encodeURIComponent(entry)}`;
}

/**
 * Renders one EPUB spine item in a same-origin sandboxed iframe and paginates
 * it with CSS multi-column from the PARENT: after load we reach into the
 * iframe's `contentDocument` (allowed because the resource is served from our
 * own origin and the iframe carries `allow-same-origin` but NOT `allow-scripts`),
 * inject a controlled stylesheet, measure `scrollWidth` → page count, and apply
 * a `translateX` per page. Theme/font/size changes and container resizes
 * re-measure. A transparent overlay above the iframe captures tap-zone nav,
 * since clicks inside the iframe don't bubble to the parent.
 *
 * Scroll mode swaps the columns for vertical scroll and maps scrollTop to a
 * 0..1 position.
 */
export function EpubIframe({
  fileId,
  opfDir,
  item,
  pageMode,
  fontKey,
  fontSize,
  lineH,
  page,
  onPageCount,
  onTap,
  onScrollPos,
  scrollSeed,
  themeKey,
}: EpubIframeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Latest callbacks held in refs so the measure effect doesn't re-run on every
  // parent render (which would thrash the iframe).
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;
  const onScrollPosRef = useRef(onScrollPos);
  onScrollPosRef.current = onScrollPos;
  const scrollSeedRef = useRef(scrollSeed);
  scrollSeedRef.current = scrollSeed;

  const src = resourceUrl(fileId, opfDir, item.href);
  const paged = pageMode === 'paged';

  // Reset the loaded flag whenever the spine item changes so we re-inject.
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  /** Inject the controlled stylesheet + measure. Returns the measured count. */
  const apply = useCallback((): number => {
    const iframe = iframeRef.current;
    const container = containerRef.current;
    if (!iframe || !container) return 1;
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return 1;

    const vw = container.clientWidth;
    const vh = container.clientHeight;
    const stack = fontStack(fontKey);

    // The `--reader-*` tokens are defined on the parent's themed element and
    // do not cross the iframe boundary. Resolve them from the nearest
    // `data-reader-theme` ancestor (ReaderRoot's div) and mirror the computed
    // literals into the iframe so the `var()` references below resolve.
    const themed =
      container.closest('[data-reader-theme]') ??
      (typeof document !== 'undefined' ? document.documentElement : null);
    let rootVars = '';
    if (themed && typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(themed);
      const decls = READER_VARS.map((name) => {
        const value = cs.getPropertyValue(name).trim();
        return value ? `${name}: ${value};` : '';
      }).join(' ');
      rootVars = `:root { ${decls} }`;
    }

    let style = doc.getElementById('rd-inject') as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = 'rd-inject';
      doc.head.appendChild(style);
    }

    const common = `
      ${rootVars}
      html, body { margin: 0; }
      body {
        font-family: ${stack};
        font-size: ${fontSize}px;
        line-height: ${lineH};
        color: var(--reader-ink, #1a1a1a);
        background: var(--reader-page, transparent);
        box-sizing: border-box;
      }
      img, svg, video { max-width: 100%; height: auto; }
      a { color: var(--reader-accent, inherit); }
    `;

    if (paged) {
      style.textContent = `
        ${common}
        html, body { height: ${vh}px; overflow: hidden; }
        body {
          column-width: ${vw}px;
          column-gap: ${GAP}px;
          column-fill: auto;
          height: ${vh}px;
          padding: 0 ${PAD_X / 2}px;
          transition: transform .34s cubic-bezier(.4,0,.2,1);
        }
      `;
      // Force reflow before measuring.
      void doc.body.offsetWidth;
      // Single source of truth for the item's real page count. The previous
      // ceil((scrollWidth + GAP) / step) ignored the body padding and added a
      // spurious GAP, so it over-counted by one — the keyboard/tap stepper
      // would then walk onto that phantom blank trailing column while the
      // slider (which always lands on page 0 of an item) never did.
      return epubColumnPageCount(doc.body.scrollWidth, vw, GAP, PAD_X);
    }

    style.textContent = `
      ${common}
      html, body { height: auto; }
      body {
        max-width: 680px;
        margin: 0 auto;
        padding: 24px;
        overflow-x: hidden;
      }
    `;
    return 1;
  }, [fontKey, fontSize, lineH, paged, themeKey]);

  // Re-measure on load, on settings change, and on container resize.
  useLayoutEffect(() => {
    if (!loaded) return;
    const run = () => {
      const count = apply();
      onPageCountRef.current(count);
    };
    run();
    const doc = iframeRef.current?.contentDocument;
    if (doc?.fonts?.ready) void doc.fonts.ready.then(run);
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(run);
    ro.observe(container);
    return () => ro.disconnect();
  }, [loaded, apply]);

  // Apply the per-page translateX imperatively (paged mode).
  useLayoutEffect(() => {
    if (!loaded || !paged) return;
    const iframe = iframeRef.current;
    const container = containerRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body || !container) return;
    const step = container.clientWidth + GAP;
    doc.body.style.transform = `translateX(${-page * step}px)`;
  }, [loaded, paged, page, fontKey, fontSize, lineH]);

  // Scroll-mode: seed offset on entry; report position on scroll.
  useEffect(() => {
    if (!loaded || paged) return;
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow;
    if (!doc || !win) return;
    const seedPos = scrollSeedRef.current ?? 0;
    const el = doc.scrollingElement ?? doc.documentElement;
    const max = el.scrollHeight - (iframeRef.current?.clientHeight ?? 0);
    if (max > 0) el.scrollTop = max * seedPos;
    const onScroll = () => {
      const m = el.scrollHeight - (iframeRef.current?.clientHeight ?? 0);
      if (m > 0) onScrollPosRef.current?.(el.scrollTop / m);
    };
    win.addEventListener('scroll', onScroll, { passive: true });
    return () => win.removeEventListener('scroll', onScroll);
  }, [loaded, paged]);

  // Tap-zone nav from the overlay (paged) — left third prev, right third next,
  // middle toggles chrome.
  const onOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width <= 0) return;
      const rel = (e.clientX - r.left) / r.width;
      if (rel < 0.3) onTap('prev');
      else if (rel > 0.7) onTap('next');
      else onTap('toggle');
    },
    [onTap],
  );

  const containerStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    background: 'var(--reader-page)',
  };

  return (
    <div ref={containerRef} style={containerStyle}>
      <iframe
        ref={iframeRef}
        src={src}
        title="EPUB content"
        sandbox="allow-same-origin"
        onLoad={() => setLoaded(true)}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: 'var(--reader-page)',
        }}
      />
      {paged && (
        <div
          aria-hidden
          onClick={onOverlayClick}
          style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
        />
      )}
    </div>
  );
}

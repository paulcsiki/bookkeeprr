'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { fontStack } from './lib/text-settings';
import type { ReaderDir, ReaderFontKey, ReaderPageMode } from './SettingsSheet';

export interface FoliateSurfaceProps {
  /** The library file whose raw ebook is streamed from the download route. */
  fileId: number;
  /** Page layout: paged columns or continuous scroll. */
  pageMode: ReaderPageMode;
  /** Reading direction (foliate honors the book's own dir; this is a hint). */
  dir: ReaderDir;
  fontKey: ReaderFontKey;
  fontSize: number;
  lineH: number;
  /**
   * The active reader page-theme key plus its derived values. The `--reader-*`
   * custom properties live on the parent's `data-reader-theme` element and do
   * NOT cross into foliate's content iframe, so we resolve them from the parent
   * and inject literal values via `renderer.setStyles`. Part of the re-apply
   * trigger so a theme switch re-injects the resolved colors.
   */
  themeKey: string;
  /**
   * The 0..1 reading fraction to resume at on first open. Read once; later
   * changes do not re-seek (the user is driving navigation after that).
   */
  resumeFraction: number;
  /** Reports the current 0..1 reading fraction (debounced upstream). */
  onRelocate: (fraction: number) => void;
  /**
   * Reports foliate's Kindle-style location readout (0-based `current`, total
   * count) on each relocate, when foliate computes one. Used for the "X / Y"
   * rail label. Absent on relocate events that carry no `location` (the parent
   * then falls back to the percent label).
   */
  onLocation?: (loc: { current: number; total: number }) => void;
  /**
   * Reports the book's flattened table of contents once, after `open()`. Each
   * entry carries an href (passed back through `navRef.goToHref`) and a nesting
   * `depth` (0 = top level) for indentation.
   */
  onToc?: (entries: FoliateTocEntry[]) => void;
  /** Tap-zone navigation resolved to prev / next / toggle chrome. */
  onTap: (action: 'prev' | 'next' | 'toggle') => void;
  /**
   * Imperative nav handle: the parent assigns next/prev/goToFraction/goToHref
   * so the chrome's arrows / scrubber / TOC drive the same foliate instance.
   */
  navRef?: React.MutableRefObject<FoliateNav | null>;
}

/** A flattened table-of-contents entry from foliate's nested `book.toc`. */
export interface FoliateTocEntry {
  label: string;
  href: string;
  depth: number;
}

/** The imperative navigation surface the parent drives. */
export interface FoliateNav {
  next: () => void;
  prev: () => void;
  goToFraction: (frac: number) => void;
  goToHref: (href: string) => void;
}

/** foliate's nested TOC node shape (see view.js / progress.js). */
interface FoliateTocNode {
  label?: string;
  href?: string;
  subitems?: FoliateTocNode[];
}

/**
 * Flatten foliate's nested `book.toc` into a depth-tagged list, preserving
 * document order. Entries without an href (section dividers) are skipped but
 * their children still recurse at the next depth.
 */
function flattenToc(nodes: FoliateTocNode[] | undefined, depth = 0): FoliateTocEntry[] {
  if (!Array.isArray(nodes)) return [];
  const out: FoliateTocEntry[] = [];
  for (const n of nodes) {
    if (typeof n?.href === 'string' && n.href.length > 0) {
      out.push({ label: (n.label ?? '').trim() || n.href, href: n.href, depth });
    }
    if (Array.isArray(n?.subitems) && n.subitems.length > 0) {
      out.push(...flattenToc(n.subitems, depth + 1));
    }
  }
  return out;
}

/** The minimal `<foliate-view>` surface this component relies on (see view.js). */
type FoliateView = HTMLElement & {
  open: (file: Blob | ArrayBuffer | File) => Promise<void>;
  next: (distance?: number) => Promise<void>;
  prev: (distance?: number) => Promise<void>;
  goToFraction: (frac: number) => Promise<void>;
  goTo: (target: string) => Promise<unknown>;
  close: () => void;
  book?: { dir?: string; toc?: FoliateTocNode[] };
  renderer?: {
    setStyles?: (css: string) => void;
    setAttribute: (name: string, value: string) => void;
  };
};

/**
 * Renders a MOBI / AZW3 ebook with foliate-js. The library is dynamically
 * imported on the client (kept out of the server/SSR bundle), the raw file is
 * fetched from the streaming `/api/reader/ebook/<fileId>/download` route, and
 * foliate auto-detects the format (its `mobi.js` parses both Mobipocket and
 * KF8/AZW3). Reading position is reported as a 0..1 fraction via `relocate`;
 * the parent persists it as a `{ frac }` locator and seeds `resumeFraction` to
 * restore it. Theme/font/size are injected into foliate's content document via
 * `renderer.setStyles`, mirroring the parent-resolved `--reader-*` tokens since
 * they don't cross the iframe boundary. A transparent overlay captures tap-zone
 * nav.
 */
export function FoliateSurface({
  fileId,
  pageMode,
  dir,
  fontKey,
  fontSize,
  lineH,
  themeKey,
  resumeFraction,
  onRelocate,
  onLocation,
  onToc,
  onTap,
  navRef,
}: FoliateSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Hold the latest callbacks/values in refs so the open effect (which runs
  // once per file) doesn't re-run and tear down the view on every parent render.
  const onRelocateRef = useRef(onRelocate);
  onRelocateRef.current = onRelocate;
  const onLocationRef = useRef(onLocation);
  onLocationRef.current = onLocation;
  const onTocRef = useRef(onToc);
  onTocRef.current = onToc;
  const resumeRef = useRef(resumeFraction);

  // Build the literal CSS foliate injects into its content document. The
  // `--reader-*` tokens live on the parent's themed element and do not cross
  // into the iframe, so we resolve them and write literal values.
  const buildStyles = useCallback((): string => {
    const container = containerRef.current;
    const stack = fontStack(fontKey);
    const themed =
      container?.closest('[data-reader-theme]') ??
      (typeof document !== 'undefined' ? document.documentElement : null);
    let ink = '#1a1a1a';
    let page = 'transparent';
    let accent = 'inherit';
    if (themed && typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(themed);
      ink = cs.getPropertyValue('--reader-ink').trim() || ink;
      page = cs.getPropertyValue('--reader-page').trim() || page;
      accent = cs.getPropertyValue('--reader-accent').trim() || accent;
    }
    return `
      html, body {
        color: ${ink} !important;
        background: ${page} !important;
        font-size: ${fontSize}px !important;
        line-height: ${lineH} !important;
      }
      body, p, li, blockquote, dd {
        font-family: ${stack} !important;
        line-height: ${lineH} !important;
      }
      a { color: ${accent} !important; }
      img, svg, video { max-width: 100% !important; height: auto !important; }
    `;
  }, [fontKey, fontSize, lineH]);

  // Open the book once per file. Tear down the foliate view + listeners on
  // unmount / file change so nothing is leaked when navigating away.
  useEffect(() => {
    let cancelled = false;
    let view: FoliateView | null = null;
    let onRelocateListener: ((e: Event) => void) | null = null;

    (async () => {
      // Dynamic import registers the `<foliate-view>` custom element. Kept
      // inside the effect so it never runs during SSR / on the server.
      await import('foliate-js/view.js');
      const res = await fetch(`/api/reader/ebook/${fileId}/download`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`ebook download failed: HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (cancelled) return;

      const el = document.createElement('foliate-view') as FoliateView;
      view = el;
      const container = containerRef.current;
      if (!container) return;
      container.appendChild(el);

      onRelocateListener = (e: Event) => {
        const detail = (
          e as CustomEvent<{
            fraction?: number;
            location?: { current?: number; total?: number };
          }>
        ).detail;
        const frac = detail?.fraction;
        if (typeof frac === 'number') onRelocateRef.current(frac);
        // foliate computes a Kindle-style location ({current,next,total}) from
        // the book size — available immediately, no extra setup. Forward it for
        // the "X / Y" rail readout; the parent falls back to percent if absent.
        const loc = detail?.location;
        if (loc && typeof loc.current === 'number' && typeof loc.total === 'number') {
          onLocationRef.current?.({ current: loc.current, total: loc.total });
        }
      };
      el.addEventListener('relocate', onRelocateListener);

      await el.open(buf);
      if (cancelled) {
        el.close();
        el.remove();
        return;
      }
      viewRef.current = el;

      // Capture the TOC once: `book.toc` is a nested array, populated by open().
      onTocRef.current?.(flattenToc(el.book?.toc));

      // Layout (paged vs scrolled) — set before the first paint.
      el.renderer?.setAttribute('flow', pageMode === 'scroll' ? 'scrolled' : 'paginated');
      el.renderer?.setStyles?.(buildStyles());

      // Resume from the persisted fraction, else render the first page.
      const seed = resumeRef.current;
      if (seed > 0) {
        await el.goToFraction(Math.min(1, Math.max(0, seed)));
      } else {
        await el.next();
      }
      if (cancelled) return;
      setReady(true);
    })().catch(() => {
      // Fetch/parse failure (corrupt or unsupported file, network error):
      // surface a readable error state instead of a blank page.
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      if (view && onRelocateListener) view.removeEventListener('relocate', onRelocateListener);
      try {
        view?.close();
      } catch {
        /* renderer may already be torn down */
      }
      view?.remove();
      viewRef.current = null;
      setReady(false);
      setFailed(false);
    };
    // Keyed to the file only: pageMode / theme / font changes are applied live
    // by the effects below rather than by re-opening (which would re-parse the
    // whole buffer). buildStyles/pageMode are intentionally read at open time
    // and re-applied separately, so they are not deps here.
  }, [fileId]);

  // Re-apply flow (page mode) live when the user toggles it.
  useEffect(() => {
    if (!ready) return;
    viewRef.current?.renderer?.setAttribute(
      'flow',
      pageMode === 'scroll' ? 'scrolled' : 'paginated',
    );
  }, [ready, pageMode]);

  // Re-inject styles when theme/font/size change.
  useEffect(() => {
    if (!ready) return;
    viewRef.current?.renderer?.setStyles?.(buildStyles());
  }, [ready, themeKey, buildStyles]);

  // Expose imperative nav to the parent (arrows / scrubber).
  useEffect(() => {
    if (!navRef) return;
    navRef.current = {
      next: () => void viewRef.current?.next(),
      prev: () => void viewRef.current?.prev(),
      goToFraction: (frac: number) =>
        void viewRef.current?.goToFraction(Math.min(1, Math.max(0, frac))),
      goToHref: (href: string) => void viewRef.current?.goTo(href),
    };
    return () => {
      if (navRef.current) navRef.current = null;
    };
  }, [navRef]);

  const onOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width <= 0) return;
      const rel = (e.clientX - r.left) / r.width;
      // Respect RTL: the visual "next" edge flips.
      const rtl = dir === 'rtl';
      if (rel < 0.3) onTap(rtl ? 'next' : 'prev');
      else if (rel > 0.7) onTap(rtl ? 'prev' : 'next');
      else onTap('toggle');
    },
    [onTap, dir],
  );

  const containerStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    background: 'var(--reader-page)',
  };

  return (
    <div ref={containerRef} style={containerStyle} data-testid="foliate-surface">
      {failed ? (
        <div
          data-testid="foliate-error"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--reader-ink)',
            zIndex: 3,
          }}
        >
          This book couldn’t be opened. The file may be corrupt or an unsupported variant.
        </div>
      ) : (
        <div
          aria-hidden
          onClick={onOverlayClick}
          style={{ position: 'absolute', inset: 0, cursor: 'pointer', zIndex: 2 }}
        />
      )}
    </div>
  );
}

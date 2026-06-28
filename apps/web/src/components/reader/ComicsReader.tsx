'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseReadableKey, type ReaderManifest } from '@bookkeeprr/types';
import { ReaderRoot } from './ReaderRoot';
import { useReaderTheme } from './ReaderContext';
import { ReaderTopBar } from './ReaderTopBar';
import { ProgressRail } from './ProgressRail';
import { RestartToast } from './RestartToast';
import {
  SettingsSheet,
  type ReaderChromeMode,
  type ReaderDir,
  type ReaderSpread,
  type SettingsState,
  type SettingsSetter,
} from './SettingsSheet';
import { useLocalStorage } from '@/components/hooks/useLocalStorage';
import { TOCPanel } from './TOCPanel';
import { RIcon } from './icons';
import { inkA } from './lib/colors';
import { type ReaderThemeKey } from './lib/reader-theme';
import { chapterAt } from './lib/format';
import { pageToPosition, positionToPage } from './lib/position';
import { useProgress } from './hooks/useProgress';
import { useReadingHeartbeat } from './hooks/useReadingHeartbeat';
import { usePageVisible } from './hooks/usePageVisible';
import { useFullscreen } from './hooks/useFullscreen';
import { useReaderEscape } from './hooks/useReaderEscape';
import { nextIndex, pagePair, prevIndex, tapAction } from './lib/comics-nav';
import { loadReaderSettings, saveReaderSettings } from './lib/reader-settings-storage';
import { ZOOM_MIN, clampZoom, clampPan, toggleZoom, type Pan } from './lib/zoom';
import { ensureReaderKeyframes } from './anim';

export interface ComicsReaderProps {
  manifest: ReaderManifest;
  /** Initial reading direction; defaults to manga→rtl, comic→ltr. */
  initialDir?: ReaderDir;
  /** Initial spread mode; defaults to single. */
  initialSpread?: ReaderSpread;
  /** Compact (mobile) layout — forces single-page spread. */
  compact?: boolean;
  /** Leave the reader (wired to the top bar's back chevron). */
  onBack?: () => void;
}

/** Resolve the page-image URL for a given 0-based page index. */
function pageSrc(fileId: number, n: number): string {
  return `/api/reader/comics/${fileId}/page/${n}`;
}

type Overlay = 'settings' | 'toc' | null;

/** Idle time before reader chrome auto-hides for immersive reading. */
const CHROME_IDLE_MS = 2500;

/**
 * One comic page image, lazy-loaded. The image sizes itself to fit the
 * available slot (definite height, flex-distributed width) while preserving its
 * own aspect ratio — so a tall page fits to height and a wide double-page spread
 * fits to width, instead of being letterboxed inside a fixed 2:3 box.
 */
function ComicPage({
  fileId,
  n,
  flat = false,
}: {
  fileId: number;
  n: number;
  flat?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pageSrc(fileId, n)}
      alt={`Page ${n + 1}`}
      loading="lazy"
      style={{
        display: 'block',
        maxWidth: '100%',
        maxHeight: '100%',
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        background: inkA(0.08),
        borderRadius: flat ? 0 : 4,
        boxShadow: flat ? 'none' : `0 14px 40px ${inkA(0.4)}`,
      }}
    />
  );
}

/** The inner reader, rendered inside a ReaderRoot so it can read theme context. */
function ComicsReaderInner({
  manifest,
  initialDir,
  initialSpread = 'single',
  compact = false,
  onBack,
}: ComicsReaderProps & { initialDir: ReaderDir }) {
  const theme = useReaderTheme();
  const { fileId } = (() => {
    const parsed = parseReadableKey(manifest.readableKey);
    return parsed.kind === 'page' ? { fileId: parsed.fileId } : { fileId: -1 };
  })();

  const pageCount = Math.max(1, manifest.pageCount ?? 1);
  const { position, commit, restartedFromFinish } = useProgress(manifest);

  const [dir, setDir] = useState<ReaderDir>(initialDir);
  const [spread, setSpread] = useState<ReaderSpread>(compact ? 'single' : initialSpread);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [flash, setFlash] = useState(restartedFromFinish);
  const [chromeMode, setChromeMode] = useLocalStorage<ReaderChromeMode>(
    'bookkeeprr.reader.chrome-mode',
    'bar',
  );

  // Hydrate the persisted spread + direction once, after mount (SSR-markup
  // safety — see ReaderRoot). Compact layouts force single-page, so they don't
  // hydrate/overwrite the stored spread. `dir` is seeded per content type
  // (manga→rtl, comic→ltr); an explicit stored pick (only written once the user
  // changes it) takes precedence over that seed so the choice survives reopen.
  useEffect(() => {
    const stored = loadReaderSettings('comics');
    if (!compact && stored.spread !== undefined) setSpread(stored.spread);
    if (stored.dir !== undefined) setDir(stored.dir);
  }, [compact]);

  // Zoom + pan on the paged surface (single / spread). `zoom` is the scale
  // (1..3); `pan` is the centered offset in px. Both reset on a page turn.
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomed = zoom > ZOOM_MIN;

  const { fullscreen, toggleFullscreen } = useFullscreen(rootRef);

  // Escape backs out one layer: panel → fullscreen → exit reader.
  useReaderEscape({
    overlayOpen: overlay !== null,
    closeOverlay: () => setOverlay(null),
    onExit: () => onBack?.(),
    fullscreen,
  });

  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const rtl = dir === 'rtl';
  const isDouble = spread === 'double' && !compact;
  const webtoon = spread === 'webtoon';
  const step = isDouble ? 2 : 1;

  const idx = positionToPage(position, pageCount);
  const chapter = chapterAt(manifest, position);

  // Reading-stats heartbeat: active while mounted + visible. Units = pages
  // newly reached since the previous heartbeat (monotonic on furthest page).
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const lastUnitPageRef = useRef(idx);
  const getPageUnitDelta = useCallback((): number => {
    const delta = idxRef.current - lastUnitPageRef.current;
    if (delta <= 0) return 0;
    lastUnitPageRef.current = idxRef.current;
    return delta;
  }, []);
  useReadingHeartbeat({
    isActive: usePageVisible(),
    getUnitDelta: getPageUnitDelta,
    readableKey: manifest.readableKey,
  });

  const goIdx = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(pageCount - 1, n));
      commit(pageToPosition(clamped, pageCount), { page: clamped });
    },
    [commit, pageCount],
  );

  const next = useCallback(() => goIdx(nextIndex(idx, pageCount, step)), [goIdx, idx, pageCount, step]);
  const prev = useCallback(() => goIdx(prevIndex(idx, pageCount, step)), [goIdx, idx, pageCount, step]);

  // Reset zoom/pan whenever the page (or spread/direction) changes.
  useEffect(() => {
    setZoom(ZOOM_MIN);
    setPan({ x: 0, y: 0 });
  }, [idx, spread, dir]);

  // Clamp a pan offset against the live stage/content sizes (scaled content vs
  // container) so the page can't be dragged past the visible edges.
  const clampToStage = useCallback((p: Pan, scale: number): Pan => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return p;
    const cr = content.getBoundingClientRect();
    return clampPan(
      p,
      { w: stage.clientWidth, h: stage.clientHeight },
      // getBoundingClientRect already includes the CSS transform scale.
      { w: cr.width, h: cr.height === 0 ? content.clientHeight * scale : cr.height },
    );
  }, []);

  // Apply a new zoom level, re-clamping the existing pan against it.
  const applyZoom = useCallback(
    (nextScale: number) => {
      const clamped = clampZoom(nextScale);
      setZoom(clamped);
      setPan((p) => (clamped <= ZOOM_MIN ? { x: 0, y: 0 } : clampToStage(p, clamped)));
    },
    [clampToStage],
  );

  // Ctrl/Cmd + wheel zooms about the current center.
  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    },
    [applyZoom, zoom],
  );

  // Double-click toggles 1×↔2×.
  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      applyZoom(toggleZoom(zoom));
    },
    [applyZoom, zoom],
  );

  // Pointer tracking for pinch (two pointers) + drag-pan (one pointer, zoomed).
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const dragLast = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
      if (ptrs.current.size === 2) {
        const [a, b] = [...ptrs.current.values()];
        if (a && b) pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
        dragLast.current = null;
      } else if (zoomed) {
        dragLast.current = { x: e.clientX, y: e.clientY };
      }
    },
    [zoom, zoomed],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const p = ptrs.current.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (ptrs.current.size === 2 && pinchStart.current) {
        const [a, b] = [...ptrs.current.values()];
        if (a && b) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinchStart.current.dist > 0) {
            applyZoom((pinchStart.current.zoom * dist) / pinchStart.current.dist);
          }
        }
      } else if (zoomed && dragLast.current) {
        const dx = e.clientX - dragLast.current.x;
        const dy = e.clientY - dragLast.current.y;
        dragLast.current = { x: e.clientX, y: e.clientY };
        setPan((prevPan) => clampToStage({ x: prevPan.x + dx, y: prevPan.y + dy }, zoom));
      }
    },
    [applyZoom, clampToStage, zoom, zoomed],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchStart.current = null;
    dragLast.current = null;
  }, []);

  // Keyboard: always active (one reader per page). Right/Left honor direction.
  useEffect(() => {
    if (webtoon) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (rtl) prev();
        else next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (rtl) next();
        else prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [webtoon, rtl, next, prev]);

  // Immersive auto-hide: when the pointer sits idle, hide all chrome so the page
  // fills the screen. Pointer movement reveals chrome and restarts the idle
  // countdown; leaving fullscreen always reveals it. Keyboard navigation does
  // NOT reveal chrome — only the pointer does — so reading by keyboard stays
  // immersive. Paused while a panel (settings/TOC) is open.
  useEffect(() => {
    if (overlay !== null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setChromeHidden(true), CHROME_IDLE_MS);
    };
    const onMove = (): void => {
      setChromeHidden(false);
      arm();
    };
    const onFsChange = (): void => {
      if (timer) clearTimeout(timer);
      // Entering fullscreen → go immersive immediately (no show-then-hide
      // flicker). Leaving fullscreen → reveal chrome.
      setChromeHidden(Boolean(document.fullscreenElement));
    };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('fullscreenchange', onFsChange);
    arm(); // start the idle countdown immediately
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [overlay]);

  // Webtoon scroll <-> position sync. We seed the scroll offset from the
  // current position only when switching into webtoon (tracked via a ref) so a
  // live scroll isn't yanked back on every position tick.
  const scrollRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  positionRef.current = position;
  useEffect(() => {
    if (!webtoon || !scrollRef.current) return;
    const el = scrollRef.current;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) el.scrollTop = max * positionRef.current;
  }, [webtoon]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) commit(el.scrollTop / max, { page: positionToPage(el.scrollTop / max, pageCount) });
  }, [commit, pageCount]);

  // Tap-zone nav on the paged surface.
  const onTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Tap-zone paging is disabled while zoomed — taps pan/inspect instead.
      if (zoomed) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width <= 0) return;
      const rel = (e.clientX - r.left) / r.width;
      const action = tapAction(rel, rtl);
      if (action === 'toggle') setChromeHidden((h) => !h);
      else if (action === 'forward') next();
      else prev();
    },
    [rtl, next, prev, zoomed],
  );

  // Bridge the SettingsSheet's flat state to the reader-theme context + local nav.
  const st: SettingsState = {
    theme: theme.themeKey,
    auto: theme.auto,
    brightness: theme.brightness,
    warmth: theme.warmth,
    fontSize: 18,
    lineH: 1.6,
    font: 'sans',
    pageMode: 'paged',
    spread,
    dir,
    chromeMode,
  };
  const set: SettingsSetter = (key, value) => {
    switch (key) {
      case 'theme':
        theme.setTheme(value as ReaderThemeKey);
        break;
      case 'auto':
        theme.setAuto(value as boolean);
        break;
      case 'brightness':
        theme.setBrightness(value as number);
        break;
      case 'warmth':
        theme.setWarmth(value as number);
        break;
      case 'spread':
        setSpread(value as ReaderSpread);
        if (!compact) saveReaderSettings('comics', { spread: value as ReaderSpread });
        break;
      case 'dir':
        setDir(value as ReaderDir);
        saveReaderSettings('comics', { dir: value as ReaderDir });
        break;
      case 'chromeMode':
        setChromeMode(value as ReaderChromeMode);
        break;
      default:
        break;
    }
  };

  const topInset = compact ? 46 : 8;
  const botInset = compact ? 26 : 10;

  // Visible page pair (spread) or single page; out-of-range indices filtered.
  const pair = isDouble ? pagePair(idx, rtl) : [idx];
  const visible = pair.filter((p) => p >= 0 && p < pageCount);

  // Prefetch neighbors (±1) off-screen so a turn lands instantly.
  const prefetch = [idx - 1, idx + step, idx + step + 1].filter(
    (p) => p >= 0 && p < pageCount && !visible.includes(p),
  );

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'var(--reader-page)',
        color: 'var(--reader-ink)',
        transition: 'background .3s',
        // Hide the cursor too while chrome is auto-hidden, for a clean immersive
        // view; it returns the instant the pointer moves (which reveals chrome).
        cursor: chromeHidden ? 'none' : 'auto',
      }}
    >
      <ReaderTopBar
        manifest={manifest}
        chapter={chapter}
        compact={compact}
        bookmarked={bookmarked}
        onBack={onBack}
        onBookmark={() => setBookmarked((b) => !b)}
        onTOC={() => setOverlay('toc')}
        onSettings={() => setOverlay('settings')}
        onFullscreen={toggleFullscreen}
        fullscreen={fullscreen}
        hidden={chromeHidden}
        topInset={topInset}
        floating={chromeMode === 'floating'}
      />

      {webtoon ? (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onClick={() => setChromeHidden((h) => !h)}
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            cursor: 'pointer',
            background: 'var(--reader-page)',
          }}
        >
          <div
            style={{
              maxWidth: compact ? '100%' : 520,
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
            }}
          >
            {Array.from({ length: pageCount }, (_, i) => (
              <div key={i} style={{ width: '100%' }}>
                <ComicPage fileId={fileId} n={i} flat />
              </div>
            ))}
            <div
              className="font-mono"
              style={{
                padding: 30,
                textAlign: 'center',
                fontSize: 11,
                color: 'var(--reader-faint)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              End
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={stageRef}
          onClick={onTap}
          onDoubleClick={onDoubleClick}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: 'absolute',
            inset: 0,
            // When chrome auto-hides, drop the space reserved for the top bar /
            // bottom rail so the page grows to fill the viewport; animate both
            // ways. Safe-area insets are kept.
            paddingTop: chromeHidden ? topInset : topInset + 44,
            paddingBottom: chromeHidden ? botInset : botInset + 40,
            transition: 'padding .3s ease',
            // Flex (not grid) centering: a grid track defaults to its content's
            // (auto) size, so the content row's `height: 100%` resolved against
            // the page's intrinsic height instead of the stage — letting a tall
            // page overflow the viewport. As a flex container the stage gives
            // the row a definite height, so the page fits to screen height.
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            touchAction: zoomed ? 'none' : 'pan-y',
            cursor: zoomed ? 'grab' : 'pointer',
          }}
        >
          <div
            ref={contentRef}
            style={{
              display: 'flex',
              gap: isDouble ? 2 : 0,
              // The flex stage gives this row a definite height to fill, so the
              // page-slots (and the image's `max-height: 100%`) resolve against
              // the visible area — not the page's intrinsic height. `minHeight: 0`
              // lets it shrink to the stage rather than grow to its content.
              height: '100%',
              minHeight: 0,
              // Full available width so the flex page-slots have a definite size
              // to share; border-box keeps the side padding inside that width.
              width: '100%',
              boxSizing: 'border-box',
              alignItems: 'center',
              justifyContent: 'center',
              padding: compact ? '0 8px' : '0 20px',
              maxWidth: '100%',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: dragLast.current || pinchStart.current ? 'none' : 'transform .12s ease-out',
              willChange: 'transform',
            }}
          >
            {visible.map((p) => (
              <div
                key={p}
                style={{
                  // Each page gets an equal share of the width (full in single
                  // mode, half in a spread) and the full available height; the
                  // image fits within it preserving its own aspect ratio.
                  flex: '1 1 0',
                  minWidth: 0,
                  height: chromeHidden ? '100%' : '94%',
                  transition: 'height .3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'rd-page-in .26s ease both',
                }}
              >
                <ComicPage fileId={fileId} n={p} />
              </div>
            ))}
          </div>

          {/* tap-zone hint chevrons (hidden while zoomed — paging is disabled) */}
          {!chromeHidden && !compact && !zoomed && (
            <>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  [rtl ? 'right' : 'left']: 0,
                  width: '14%',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--reader-faint)',
                  pointerEvents: 'none',
                }}
              >
                <RIcon name={rtl ? 'chevR' : 'chevL'} size={26} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  [rtl ? 'left' : 'right']: 0,
                  width: '14%',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--reader-accent)',
                  opacity: 0.8,
                  pointerEvents: 'none',
                }}
              >
                <RIcon name={rtl ? 'chevL' : 'chevR'} size={26} />
              </div>
            </>
          )}
        </div>
      )}

      {/* direction + spread badge */}
      {!chromeHidden && (
        <div
          className="font-mono"
          style={{
            position: 'absolute',
            top: topInset + 40,
            [rtl ? 'left' : 'right']: compact ? 14 : 22,
            zIndex: 28,
            display: 'flex',
            gap: 7,
            alignItems: 'center',
            // Solid surface (not translucent) so the label stays readable over
            // any page art; matches the reader's chrome panels.
            background: 'var(--reader-chrome)',
            border: '1px solid var(--reader-line-2)',
            boxShadow: `0 2px 10px ${inkA(0.35)}`,
            borderRadius: 99,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: 'var(--reader-ink)',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {rtl ? 'Right' : 'Left'}
            {/* crisp SVG arrow (block-level) flex-centers cleanly between the
                words, unlike a tiny baseline-aligned text glyph */}
            <RIcon name={rtl ? 'rtl' : 'ltr'} size={20} color="var(--reader-accent)" />
            {rtl ? 'Left' : 'Right'}
          </span>
          {webtoon ? ' · Webtoon' : isDouble ? ' · Spread' : ' · Single'}
        </div>
      )}

      <ProgressRail
        manifest={manifest}
        position={position}
        compact={compact}
        botInset={botInset}
        hidden={chromeHidden}
        label={{
          left: `Page ${idx + 1} / ${pageCount}`,
          right: `${chapter ? chapter.title : 'chapter'} · ${Math.round(position * 100)}%`,
        }}
        onScrub={
          webtoon
            ? (p) => {
                const el = scrollRef.current;
                if (el) {
                  const max = el.scrollHeight - el.clientHeight;
                  if (max > 0) el.scrollTop = max * p;
                }
                commit(p, { page: positionToPage(p, pageCount) });
              }
            : (p) => goIdx(positionToPage(p, pageCount))
        }
      />

      {flash && <RestartToast onDismiss={() => setFlash(false)} compact={compact} />}

      {/* off-screen prefetch of neighbor pages */}
      <div aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        {prefetch.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p} src={pageSrc(fileId, p)} alt="" loading="lazy" />
        ))}
      </div>

      {overlay === 'settings' && (
        <SettingsSheet
          st={st}
          set={set}
          kind="comics"
          compact={compact}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'toc' && (
        <TOCPanel
          manifest={manifest}
          position={position}
          compact={compact}
          side={rtl ? 'right' : 'left'}
          onJump={(p) => commit(p, { page: positionToPage(p, pageCount) })}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

/**
 * The comics image pager — single page / two-up spread / webtoon scroll, RTL or
 * LTR, with tap-zone nav, always-active arrow keys, the shared theme-adaptive
 * chrome, and debounced progress sync. Pages are real backend renders served at
 * `/api/reader/comics/<fileId>/page/<n>`.
 *
 * Renders its own `ReaderRoot` (seeded OLED for comics per the prototype) so the
 * component is usable standalone; the app shell can still wrap it but the inner
 * surface reads its theme from context either way.
 */
export function ComicsReader({
  manifest,
  initialDir,
  initialSpread = 'single',
  compact = false,
  onBack,
}: ComicsReaderProps) {
  const dir: ReaderDir =
    initialDir ?? (manifest.contentType === 'manga' ? 'rtl' : 'ltr');
  const seedTheme: ReaderThemeKey = 'oled';

  return (
    <ReaderRoot
      initialTheme={seedTheme}
      initialAuto={false}
      persistKind="comics"
      dataTestId="reader-comics"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <ComicsReaderInner
        manifest={manifest}
        initialDir={dir}
        initialSpread={initialSpread}
        compact={compact}
        onBack={onBack}
      />
    </ReaderRoot>
  );
}

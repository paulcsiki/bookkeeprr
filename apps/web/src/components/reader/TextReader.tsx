'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { parseReadableKey, type ReaderManifest, type SpineItem } from '@bookkeeprr/types';
import { ReaderRoot } from './ReaderRoot';
import { useReaderTheme } from './ReaderContext';
import { ReaderTopBar } from './ReaderTopBar';
import { ProgressRail } from './ProgressRail';
import { RestartToast } from './RestartToast';
import {
  SettingsSheet,
  type ReaderChromeMode,
  type ReaderFontKey,
  type ReaderPageMode,
  type SettingsState,
  type SettingsSetter,
} from './SettingsSheet';
import { useLocalStorage } from '@/components/hooks/useLocalStorage';
import { TOCPanel, type HrefTocEntry } from './TOCPanel';
import { isDarkReaderTheme, type ReaderThemeKey } from './lib/reader-theme';
import { chapterAt } from './lib/format';
import {
  pageToPosition,
  positionToPage,
  spineToPosition,
} from './lib/position';
import { clampTextSettings } from './lib/text-settings';
import { loadReaderSettings, saveReaderSettings } from './lib/reader-settings-storage';
import { useProgress } from './hooks/useProgress';
import { useReadingHeartbeat } from './hooks/useReadingHeartbeat';
import { usePageVisible } from './hooks/usePageVisible';
import { useFullscreen } from './hooks/useFullscreen';
import { useReaderEscape } from './hooks/useReaderEscape';
import { EpubIframe } from './EpubIframe';
import { PdfSurface } from './PdfSurface';
import { FoliateSurface, type FoliateNav, type FoliateTocEntry } from './FoliateSurface';
import { ensureReaderKeyframes } from './anim';

export interface TextReaderProps {
  manifest: ReaderManifest;
  compact?: boolean;
  /** Leave the reader (wired to the top bar's back chevron). */
  onBack?: () => void;
}

type Overlay = 'settings' | 'toc' | null;

/** Derive the fileId a text readable addresses (-1 if not a paged file). */
function fileIdOf(manifest: ReaderManifest): number {
  try {
    const parsed = parseReadableKey(manifest.readableKey);
    return parsed.kind === 'page' ? parsed.fileId : -1;
  } catch {
    return -1;
  }
}

/** The PDF branch — a single page index mapped to position. */
function PdfBranch({
  manifest,
  compact,
  onBack,
}: {
  manifest: ReaderManifest;
  compact: boolean;
  onBack?: () => void;
}) {
  const fileId = fileIdOf(manifest);
  const { position, commit, restartedFromFinish } = useProgress(manifest);
  const [numPages, setNumPages] = useState(Math.max(1, manifest.pageCount ?? 1));
  const idx = positionToPage(position, numPages);

  const goPage = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(numPages - 1, n));
      commit(pageToPosition(clamped, numPages), { page: clamped });
    },
    [commit, numPages],
  );

  return (
    <TextChrome
      manifest={manifest}
      compact={compact}
      onBack={onBack}
      position={position}
      restartedFromFinish={restartedFromFinish}
      pageModeSupported={false}
      leftLabel={`Page ${idx + 1} / ${numPages}`}
      onScrub={(p) => goPage(positionToPage(p, numPages))}
      onArrow={(dir) => goPage(dir === 'next' ? idx + 1 : idx - 1)}
      onTOCJump={(p) => goPage(positionToPage(p, numPages))}
    >
      {(font) => (
        <PdfSurface
          fileId={fileId}
          page={idx}
          onNumPages={(n) => setNumPages(Math.max(1, n))}
          onTap={(a) => {
            if (a === 'next') goPage(idx + 1);
            else if (a === 'prev') goPage(idx - 1);
            else font.toggleChrome();
          }}
        />
      )}
    </TextChrome>
  );
}

/**
 * The MOBI / AZW3 branch — foliate-js renders the book client-side and reports
 * a 0..1 reading fraction, which maps one-to-one onto the reader `position`. We
 * persist it as a `{ frac }` locator and resume from it on open. The left rail
 * shows foliate's Kindle-style "{current+1} / {total}" location readout (from
 * the relocate event's `location`), falling back to percent when foliate hasn't
 * computed one yet. The book's own `book.toc` (href-addressed) drives the shared
 * TOCPanel's Contents tab; tapping an entry calls `view.goTo(href)`.
 */
function FoliateBranch({
  manifest,
  compact,
  onBack,
}: {
  manifest: ReaderManifest;
  compact: boolean;
  onBack?: () => void;
}) {
  const fileId = fileIdOf(manifest);
  const { position, commit, restartedFromFinish } = useProgress(manifest);
  const { font, fontSize, lineH, pageMode } = useTextSettings();
  const theme = useReaderTheme();
  const themeKey = `${theme.themeKey}:${theme.auto}:${theme.brightness}:${theme.warmth}`;

  // Resume fraction: a `{ frac }` locator if present, else the seeded position.
  const seedLoc = manifest.progress.locator;
  const resumeFraction =
    seedLoc && 'frac' in seedLoc ? Math.min(1, Math.max(0, seedLoc.frac)) : manifest.progress.position;

  const navRef = useRef<FoliateNav | null>(null);
  const [location, setLocation] = useState<{ current: number; total: number } | null>(null);
  const [toc, setToc] = useState<FoliateTocEntry[]>([]);

  const onRelocate = useCallback(
    (fraction: number) => {
      const frac = Math.min(1, Math.max(0, fraction));
      commit(frac, { frac });
    },
    [commit],
  );

  // foliate's Kindle-style location ("X / Y"); fall back to percent when absent
  // (foliate hasn't reported a `location`, or total is 0). font-mono: it's a fact.
  const leftLabel =
    location && location.total > 0
      ? `${location.current + 1} / ${location.total}`
      : undefined;

  return (
    <TextChrome
      manifest={manifest}
      compact={compact}
      onBack={onBack}
      position={position}
      restartedFromFinish={restartedFromFinish}
      pageModeSupported
      leftLabel={leftLabel}
      onScrub={(p) => navRef.current?.goToFraction(p)}
      onArrow={(dir) => (dir === 'next' ? navRef.current?.next() : navRef.current?.prev())}
      onTOCJump={(p) => navRef.current?.goToFraction(p)}
      hrefEntries={toc}
      onJumpHref={(href) => navRef.current?.goToHref(href)}
    >
      {(chrome) => (
        <FoliateSurface
          fileId={fileId}
          pageMode={pageMode}
          dir="ltr"
          fontKey={font}
          fontSize={fontSize}
          lineH={lineH}
          themeKey={themeKey}
          resumeFraction={resumeFraction}
          onRelocate={onRelocate}
          onLocation={setLocation}
          onToc={setToc}
          navRef={navRef}
          onTap={(a) => {
            if (a === 'next') navRef.current?.next();
            else if (a === 'prev') navRef.current?.prev();
            else chrome.toggleChrome();
          }}
        />
      )}
    </TextChrome>
  );
}

/** The EPUB branch — spine index + page-within-item mapped to position. */
function EpubBranch({
  manifest,
  compact,
  onBack,
}: {
  manifest: ReaderManifest;
  compact: boolean;
  onBack?: () => void;
}) {
  const fileId = fileIdOf(manifest);
  const spine: SpineItem[] = useMemo(() => manifest.spine ?? [], [manifest.spine]);
  const spineCount = Math.max(1, spine.length);
  const { position, commit, restartedFromFinish } = useProgress(manifest);
  const { font, fontSize, lineH, pageMode } = useTextSettings();
  const theme = useReaderTheme();
  // Composite key that changes whenever the resolved `--reader-*` values could
  // change, so EpubIframe re-injects the parent-resolved colors into the frame.
  const themeKey = `${theme.themeKey}:${theme.auto}:${theme.brightness}:${theme.warmth}`;

  // Seed spine/page from the manifest locator if it's an epub locator.
  const seedLoc = manifest.progress.locator;
  const seedSpine =
    seedLoc && 'spineIdx' in seedLoc ? Math.min(spineCount - 1, Math.max(0, seedLoc.spineIdx)) : 0;
  const seedPage = seedLoc && 'pageInItem' in seedLoc ? Math.max(0, seedLoc.pageInItem) : 0;

  const [spineIdx, setSpineIdx] = useState(seedSpine);
  const [pageInItem, setPageInItem] = useState(seedPage);
  const [pagesInItem, setPagesInItem] = useState(1);

  const item = spine[spineIdx] ?? spine[0] ?? { idx: 0, href: '' };

  const commitLoc = useCallback(
    (sIdx: number, pInItem: number, pCount: number) => {
      commit(spineToPosition(sIdx, pInItem, pCount, spineCount), {
        spineIdx: sIdx,
        pageInItem: pInItem,
      });
    },
    [commit, spineCount],
  );

  const goNext = useCallback(() => {
    if (pageMode === 'scroll') {
      if (spineIdx < spineCount - 1) {
        setSpineIdx(spineIdx + 1);
        setPageInItem(0);
        commitLoc(spineIdx + 1, 0, 1);
      }
      return;
    }
    if (pageInItem < pagesInItem - 1) {
      const np = pageInItem + 1;
      setPageInItem(np);
      commitLoc(spineIdx, np, pagesInItem);
    } else if (spineIdx < spineCount - 1) {
      setSpineIdx(spineIdx + 1);
      setPageInItem(0);
      commitLoc(spineIdx + 1, 0, 1);
    }
  }, [pageMode, pageInItem, pagesInItem, spineIdx, spineCount, commitLoc]);

  const goPrev = useCallback(() => {
    if (pageMode === 'scroll') {
      if (spineIdx > 0) {
        setSpineIdx(spineIdx - 1);
        setPageInItem(0);
        commitLoc(spineIdx - 1, 0, 1);
      }
      return;
    }
    if (pageInItem > 0) {
      const np = pageInItem - 1;
      setPageInItem(np);
      commitLoc(spineIdx, np, pagesInItem);
    } else if (spineIdx > 0) {
      setSpineIdx(spineIdx - 1);
      setPageInItem(0);
      commitLoc(spineIdx - 1, 0, 1);
    }
  }, [pageMode, pageInItem, pagesInItem, spineIdx, spineCount, commitLoc]);

  const onPageCount = useCallback(
    (count: number) => {
      setPagesInItem(count);
      // In paged mode pageInItem is an integer page index to clamp against the
      // measured count; in scroll mode it's a 0..1 fraction that must survive
      // the count=1 report, so leave it untouched.
      if (pageMode !== 'scroll') setPageInItem((p) => Math.min(p, count - 1));
    },
    [pageMode],
  );

  return (
    <TextChrome
      manifest={manifest}
      compact={compact}
      onBack={onBack}
      position={position}
      restartedFromFinish={restartedFromFinish}
      pageModeSupported
      onScrub={(p) => {
        const sIdx = Math.min(spineCount - 1, Math.floor(p * spineCount));
        setSpineIdx(sIdx);
        setPageInItem(0);
        commitLoc(sIdx, 0, 1);
      }}
      onArrow={(dir) => (dir === 'next' ? goNext() : goPrev())}
      onTOCJump={(p) => {
        const sIdx = Math.min(spineCount - 1, Math.floor(p * spineCount));
        setSpineIdx(sIdx);
        setPageInItem(0);
        commitLoc(sIdx, 0, 1);
      }}
    >
      {(chrome) => (
        <EpubIframe
          key={item.href}
          fileId={fileId}
          opfDir={manifest.opfDir}
          item={item}
          pageMode={pageMode}
          fontKey={font}
          fontSize={fontSize}
          lineH={lineH}
          page={pageInItem}
          themeKey={themeKey}
          onPageCount={onPageCount}
          // Scroll mode stores the fractional 0..1 offset as the locator's
          // pageInItem; paged mode keeps integer page indices (handled above).
          onScrollPos={(p) => commitLoc(spineIdx, p, 1)}
          scrollSeed={pageMode === 'scroll' ? seedPage : 0}
          onTap={(a) => {
            if (a === 'next') goNext();
            else if (a === 'prev') goPrev();
            else chrome.toggleChrome();
          }}
        />
      )}
    </TextChrome>
  );
}

/** Local text settings (font/size/spacing/page-mode), read from context-free state. */
interface TextSettingsState {
  font: ReaderFontKey;
  fontSize: number;
  lineH: number;
  pageMode: ReaderPageMode;
}

// Threads text settings (font/size/spacing/page-mode) from the SettingsSheet
// hosted in TextChrome down to the content surface (EpubIframe).
const TextSettingsContext = createContext<{
  state: TextSettingsState;
  set: (patch: Partial<TextSettingsState>) => void;
} | null>(null);

function useTextSettings(): TextSettingsState {
  const ctx = useContext(TextSettingsContext);
  return ctx?.state ?? { font: 'serif', fontSize: 19, lineH: 1.62, pageMode: 'paged' };
}

interface ChromeHandle {
  toggleChrome: () => void;
}

/** Shared chrome wrapper for both branches; renders content via a child fn. */
function TextChrome({
  manifest,
  compact,
  onBack,
  position,
  restartedFromFinish,
  pageModeSupported,
  leftLabel,
  onScrub,
  onArrow,
  onTOCJump,
  hrefEntries,
  onJumpHref,
  children,
}: {
  manifest: ReaderManifest;
  compact: boolean;
  onBack?: () => void;
  position: number;
  restartedFromFinish: boolean;
  pageModeSupported: boolean;
  leftLabel?: string;
  onScrub: (p: number) => void;
  onArrow: (dir: 'next' | 'prev') => void;
  onTOCJump: (p: number) => void;
  /** href-addressed TOC (foliate/MOBI/AZW3); routed to the shared TOCPanel. */
  hrefEntries?: HrefTocEntry[];
  onJumpHref?: (href: string) => void;
  children: (chrome: ChromeHandle) => React.ReactNode;
}) {
  const theme = useReaderTheme();
  const settings = useContext(TextSettingsContext);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [flash, setFlash] = useState(restartedFromFinish);
  const [chromeMode, setChromeMode] = useLocalStorage<ReaderChromeMode>(
    'bookkeeprr.reader.chrome-mode',
    'bar',
  );

  useEffect(() => {
    ensureReaderKeyframes();
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const chapter = chapterAt(manifest, position);
  const topInset = compact ? 46 : 8;
  const botInset = compact ? 26 : 10;

  const rootRef = useRef<HTMLDivElement>(null);
  const { fullscreen, toggleFullscreen } = useFullscreen(rootRef);

  // Escape backs out one layer: panel → fullscreen → exit reader.
  useReaderEscape({
    overlayOpen: overlay !== null,
    closeOverlay: () => setOverlay(null),
    onExit: () => onBack?.(),
    fullscreen,
  });

  // Keyboard nav (paged readers; one reader per page so always active).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        onArrow('next');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onArrow('prev');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onArrow]);

  const st: SettingsState = {
    theme: theme.themeKey,
    auto: theme.auto,
    brightness: theme.brightness,
    warmth: theme.warmth,
    fontSize: settings?.state.fontSize ?? 19,
    lineH: settings?.state.lineH ?? 1.62,
    font: settings?.state.font ?? 'serif',
    pageMode: settings?.state.pageMode ?? 'paged',
    spread: 'single',
    dir: 'ltr',
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
      case 'fontSize':
        settings?.set(clampTextSettings({ fontSize: value as number, lineH: st.lineH }));
        break;
      case 'lineH':
        settings?.set(clampTextSettings({ fontSize: st.fontSize, lineH: value as number }));
        break;
      case 'font':
        settings?.set({ font: value as ReaderFontKey });
        break;
      case 'pageMode':
        if (pageModeSupported) settings?.set({ pageMode: value as ReaderPageMode });
        break;
      case 'chromeMode':
        setChromeMode(value as ReaderChromeMode);
        break;
      default:
        break;
    }
  };

  const chromeHandle: ChromeHandle = { toggleChrome: () => setChromeHidden((h) => !h) };

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

      <div
        style={{
          position: 'absolute',
          top: topInset + 54,
          bottom: botInset + 46,
          left: compact ? 16 : '8%',
          right: compact ? 16 : '8%',
        }}
      >
        {children(chromeHandle)}
      </div>

      <ProgressRail
        manifest={manifest}
        position={position}
        compact={compact}
        botInset={botInset}
        label={
          leftLabel
            ? { left: leftLabel, right: `${Math.round(position * 100)}%` }
            : {
                left: chapter ? chapter.title : 'Reading',
                right: `${Math.round(position * 100)}%`,
              }
        }
        onScrub={onScrub}
      />

      {flash && <RestartToast onDismiss={() => setFlash(false)} compact={compact} />}

      {overlay === 'settings' && (
        <SettingsSheet st={st} set={set} kind="text" compact={compact} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'toc' && (
        <TOCPanel
          manifest={manifest}
          position={position}
          compact={compact}
          side="left"
          onJump={onTOCJump}
          hrefEntries={hrefEntries}
          onJumpHref={onJumpHref}
          onClose={() => setOverlay(null)}
        />
      )}
      {/* keep isDarkReaderTheme referenced for future chrome theming */}
      <span hidden data-dark={isDarkReaderTheme(theme.themeKey)} />
    </div>
  );
}

/**
 * The reflowable text reader. Dispatches on `manifest.format`: `epub` renders a
 * sandboxed iframe per spine item with CSS multi-column pagination (locator
 * `{ spineIdx, pageInItem }`); `pdf` rasterizes pages with pdf.js (locator
 * `{ page }`). Both are wrapped in a `ReaderRoot` seeded to the `paper` theme
 * and share the theme-adaptive chrome + `SettingsSheet kind='text'`. Text
 * settings (font / size / spacing / page-mode) live in a context so the
 * SettingsSheet and the content surface stay in sync.
 */
export function TextReader({ manifest, compact = false, onBack }: TextReaderProps) {
  const [textSettings, setTextSettings] = useState<TextSettingsState>({
    font: 'serif',
    fontSize: compact ? 18 : 19,
    lineH: 1.62,
    pageMode: 'paged',
  });

  // Hydrate persisted text settings once, after mount (effect rather than
  // useState initializer for the same SSR-markup reason as ReaderRoot —
  // font/size/layout shape the server-rendered tree). Absent fields keep the
  // defaults; stored values arrive pre-clamped from the storage module.
  useEffect(() => {
    const stored = loadReaderSettings('text');
    setTextSettings((s) => ({
      font: stored.font ?? s.font,
      fontSize: stored.fontSize ?? s.fontSize,
      lineH: stored.lineH ?? s.lineH,
      pageMode: stored.pageMode ?? s.pageMode,
    }));
  }, []);

  const settingsCtx = useMemo(
    () => ({
      state: textSettings,
      set: (patch: Partial<TextSettingsState>) => {
        setTextSettings((s) => ({ ...s, ...patch }));
        // Every patch is a discrete user pick (stepper / segmented control);
        // the field names match the persisted shape one-to-one.
        saveReaderSettings('text', patch);
      },
    }),
    [textSettings],
  );

  const isPdf = manifest.format === 'pdf';
  const isFoliate = manifest.format === 'mobi' || manifest.format === 'azw3';

  // Reading-stats heartbeat: paged readers have no play/pause, so "active" is
  // approximated as mounted + page visible.
  useReadingHeartbeat({ isActive: usePageVisible(), readableKey: manifest.readableKey });

  return (
    <ReaderRoot
      initialTheme="paper"
      initialAuto={false}
      persistKind="text"
      dataTestId="reader-text"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <TextSettingsContext.Provider value={settingsCtx}>
        {isPdf ? (
          <PdfBranch manifest={manifest} compact={compact} onBack={onBack} />
        ) : isFoliate ? (
          <FoliateBranch manifest={manifest} compact={compact} onBack={onBack} />
        ) : (
          <EpubBranch manifest={manifest} compact={compact} onBack={onBack} />
        )}
      </TextSettingsContext.Provider>
    </ReaderRoot>
  );
}

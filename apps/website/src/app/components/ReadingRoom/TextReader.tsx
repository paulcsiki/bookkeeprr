'use client';

import {
  type CSSProperties,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type BookData,
  type ReaderThemeKey,
  READER_THEMES,
  T,
  chapterAt,
  useReadingProgress,
} from './data';
import {
  type FontKey,
  type PageMode,
  type TextSettingsState,
  ProgressRail,
  ReaderTopBar,
  SettingsSheet,
  TOCPanel,
  ensureReaderKeyframes,
  navArrowStyle,
} from './chrome';
import { RIcon } from './icons';

const FONT_STACK: Record<FontKey, string> = {
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
  sans: T.fontBody,
  mono: T.fontMono,
  dys: '"Trebuchet MS", Verdana, system-ui, sans-serif',
};

type Platform = 'web' | 'tablet' | 'mobile';

export interface TextReaderProps {
  book: BookData;
  platform?: Platform;
  pid?: string;
  startPos?: number;
  fs?: boolean;
  onFullscreen?: () => void;
  initial?: Partial<TextSettingsState>;
}

interface ParaItem {
  p?: string;
  hl?: boolean;
  illo?: boolean;
}

/**
 * TextReader — reflowable reader for eBook / Light Novel. Ported from
 * docs/design/handoff-2026-06-01/bookkeeprr/project/reader-text.jsx. Uses CSS
 * multi-column for true paginated layout (single or two-up spread) with an
 * imperative translateX to flip pages at 60fps. Theme-adaptive chrome, font /
 * size / spacing / brightness / warmth controls in the Display sheet.
 */
export function TextReader({
  book,
  platform = 'web',
  pid,
  startPos,
  fs = false,
  onFullscreen,
  initial = {},
}: TextReaderProps): JSX.Element {
  const compact = platform === 'mobile';
  const spreadCapable = platform !== 'mobile';
  const topInset = platform === 'mobile' ? 48 : platform === 'tablet' ? 30 : 8;
  const botInset = platform === 'mobile' ? 28 : platform === 'tablet' ? 22 : 10;

  const [st, setSt] = useState<TextSettingsState>({
    theme: 'paper',
    auto: true,
    brightness: 1,
    warmth: 0.12,
    font: 'serif',
    fontSize: compact ? 18 : 19,
    lineH: 1.62,
    pageMode: 'paged',
    spread: spreadCapable,
    ...initial,
  });
  const set = useCallback(
    <K extends keyof TextSettingsState>(k: K, v: TextSettingsState[K]) => {
      setSt((s) => ({ ...s, [k]: v }));
    },
    [],
  );

  const themeKey: ReaderThemeKey = st.theme;
  const th = READER_THEMES[themeKey];

  const rootRef = useRef<HTMLDivElement>(null);
  const progressOpts: Parameters<typeof useReadingProgress>[1] = {};
  if (pid != null) progressOpts.pid = pid;
  if (startPos != null) progressOpts.startPos = startPos;
  const [pos, commitPos] = useReadingProgress(book, progressOpts);
  const [overlay, setOverlay] = useState<'settings' | 'toc' | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  const chapter = chapterAt(book, pos);
  const useSpread = spreadCapable && st.spread && st.pageMode === 'paged';

  // Build the prose blob — sample prose repeated to fill several pages,
  // with a highlighted paragraph for ebooks.
  const paras = useMemo<ParaItem[]>(() => {
    const out: ParaItem[] = [];
    const reps = compact ? 3 : 4;
    for (let r = 0; r < reps; r++) {
      book.prose.forEach((p, i) => {
        const item: ParaItem = { p };
        if (r === 0 && book.type === 'ebook' && i === 5) item.hl = true;
        out.push(item);
      });
    }
    return out;
  }, [book, compact]);

  // Pagination measurement
  const vpRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(0);
  const gap = compact ? 32 : 56;

  const measure = useCallback(() => {
    const vp = vpRef.current;
    const flow = flowRef.current;
    if (!vp || !flow || st.pageMode !== 'paged') return;
    const innerW = vp.clientWidth;
    const innerH = vp.clientHeight;
    const cols = useSpread ? 2 : 1;
    const colW = cols === 2 ? (innerW - gap) / 2 : innerW;
    flow.style.width = `${innerW}px`;
    flow.style.height = `${innerH}px`;
    flow.style.columnWidth = `${colW}px`;
    flow.style.columnGap = `${gap}px`;
    flow.style.columnFill = 'auto';
    const units = Math.max(1, Math.round((flow.scrollWidth + gap) / (colW + gap)));
    const pc = Math.max(1, Math.ceil(units / cols));
    setPageCount(pc);
    setPage((p) => Math.min(p, pc - 1));
  }, [st.pageMode, useSpread, gap]);

  useLayoutEffect(() => {
    let done = false;
    const run = () => {
      if (!done) measure();
    };
    run();
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.ready.then(run);
    }
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(run);
    if (vpRef.current) ro.observe(vpRef.current);
    return () => {
      done = true;
      ro.disconnect();
    };
  }, [measure, st.fontSize, st.lineH, st.font, paras]);

  // Seed initial page from saved pos, once we know the page count.
  const seeded = useRef(false);
  useEffect(() => {
    if (st.pageMode !== 'paged' || pageCount <= 1 || seeded.current) return;
    seeded.current = true;
    setPage(Math.round(pos * (pageCount - 1)));
  }, [pageCount, st.pageMode]);

  const goPage = useCallback(
    (p: number) => {
      const np = Math.max(0, Math.min(pageCount - 1, p));
      setPage(np);
      commitPos(pageCount > 1 ? np / (pageCount - 1) : 1);
    },
    [pageCount, commitPos],
  );

  // Scroll mode: sync scroll → pos
  const scrollRef = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) commitPos(el.scrollTop / max);
  };
  useEffect(() => {
    if (st.pageMode === 'scroll' && scrollRef.current) {
      const el = scrollRef.current;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = max * pos;
    }
  }, [st.pageMode]);

  // Keyboard nav (only when hovered)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (st.pageMode !== 'paged') return;
      if (!rootRef.current || !rootRef.current.matches(':hover')) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goPage(page + 1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPage(page - 1);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [page, goPage, st.pageMode]);

  // Apply measured translateX imperatively (60fps page flips, no relayout)
  useEffect(() => {
    if (st.pageMode !== 'paged') return;
    const vp = vpRef.current;
    const flow = flowRef.current;
    if (!vp || !flow) return;
    const step = vp.clientWidth + gap;
    flow.style.transition = 'transform .34s cubic-bezier(.4,0,.2,1)';
    flow.style.transform = `translateX(${-page * step}px)`;
  });

  const fontFam = FONT_STACK[st.font];
  const warmOverlay = st.warmth > 0;
  const brightness = st.brightness;

  const Para = ({ item }: { item: ParaItem }) => (
    <p style={{ margin: '0 0 1.05em', textIndent: '1.3em', textAlign: 'justify', hyphens: 'auto' }}>
      {item.hl ? (
        <mark
          style={{
            background: 'oklch(0.80 0.15 78 / 0.34)',
            color: 'inherit',
            borderRadius: 2,
            padding: '0.05em 0',
            boxShadow: '0 1px 0 oklch(0.80 0.15 78 / 0.5)',
          }}
        >
          {item.p}
        </mark>
      ) : (
        item.p
      )}
    </p>
  );

  const firstChapPage = page === 0;
  const onPageClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    if (rel < 0.3) goPage(page - 1);
    else if (rel > 0.7) goPage(page + 1);
    else setChromeHidden((h) => !h);
  };

  const handlePageMode: PageMode = st.pageMode;
  const flowStyle: CSSProperties = {
    fontFamily: fontFam,
    fontSize: st.fontSize,
    lineHeight: st.lineH,
    color: th.ink,
    willChange: 'transform',
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        inset: 0,
        background: th.page,
        color: th.ink,
        fontFamily: T.fontBody,
        overflow: 'hidden',
        transition: 'background .3s, color .3s',
      }}
    >
      {brightness < 1 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            background: '#000',
            opacity: (1 - brightness) * 0.55,
            pointerEvents: 'none',
          }}
        />
      )}
      {warmOverlay && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            background: 'hsl(34 90% 50%)',
            mixBlendMode: 'multiply',
            opacity: st.warmth * 0.5,
            pointerEvents: 'none',
          }}
        />
      )}

      <ReaderTopBar
        book={book}
        th={th}
        chapter={chapter}
        compact={compact}
        bookmarked={bookmarked}
        onBookmark={() => setBookmarked((b) => !b)}
        onTOC={() => setOverlay('toc')}
        onSettings={() => setOverlay('settings')}
        {...(onFullscreen ? { onFullscreen } : {})}
        fs={fs}
        hidden={chromeHidden}
        topInset={topInset}
      />

      {handlePageMode === 'paged' ? (
        <div
          onClick={onPageClick}
          style={{
            position: 'absolute',
            inset: 0,
            paddingTop: topInset + 54,
            paddingBottom: botInset + 46,
            cursor: 'pointer',
          }}
        >
          <div
            ref={vpRef}
            style={{
              position: 'absolute',
              top: topInset + 54,
              bottom: botInset + 46,
              left: compact ? 26 : '8%',
              right: compact ? 26 : '8%',
              overflow: 'hidden',
            }}
          >
            <div ref={flowRef} style={flowStyle}>
              {firstChapPage && (
                <div style={{ breakInside: 'avoid', marginBottom: '1.4em' }}>
                  <div
                    style={{
                      fontFamily: T.fontMono,
                      fontSize: 10.5,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: th.faint,
                      marginBottom: 10,
                    }}
                  >
                    {book.vol ? `${book.vol} · ` : ''}
                    {chapter.title.split(/[.:]/)[0]}
                  </div>
                  <div
                    style={{
                      fontFamily: T.fontDisplay,
                      fontSize: st.fontSize * 1.7,
                      fontWeight: 600,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.1,
                      marginBottom: '0.8em',
                      color: th.ink,
                    }}
                  >
                    {chapter.title.replace(/^[^.:]*[.:]\s*/, '')}
                  </div>
                </div>
              )}
              {paras.map((it, i) => (
                <Para key={i} item={it} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onClick={() => setChromeHidden((h) => !h)}
          style={{
            position: 'absolute',
            inset: 0,
            paddingTop: topInset + 64,
            paddingBottom: botInset + 56,
            overflowY: 'auto',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              maxWidth: 680,
              margin: '0 auto',
              padding: compact ? '0 26px' : '0 32px',
              fontFamily: fontFam,
              fontSize: st.fontSize,
              lineHeight: st.lineH,
              color: th.ink,
            }}
          >
            <div
              style={{
                fontFamily: T.fontMono,
                fontSize: 10.5,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: th.faint,
                marginBottom: 10,
              }}
            >
              {chapter.title.split(/[.:]/)[0]}
            </div>
            <div
              style={{
                fontFamily: T.fontDisplay,
                fontSize: st.fontSize * 1.7,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                marginBottom: '0.9em',
              }}
            >
              {chapter.title.replace(/^[^.:]*[.:]\s*/, '')}
            </div>
            {paras.map((it, i) => (
              <Para key={i} item={it} />
            ))}
          </div>
        </div>
      )}

      {/* page-turn arrows (web/tablet) */}
      {!compact && st.pageMode === 'paged' && !chromeHidden && (
        <>
          <button
            type="button"
            aria-label="Previous page"
            onClick={() => goPage(page - 1)}
            disabled={page === 0}
            style={navArrowStyle(th, 'left', page === 0)}
          >
            <RIcon name="chevL" size={20} />
          </button>
          <button
            type="button"
            aria-label="Next page"
            onClick={() => goPage(page + 1)}
            disabled={page >= pageCount - 1}
            style={navArrowStyle(th, 'right', page >= pageCount - 1)}
          >
            <RIcon name="chevR" size={20} />
          </button>
        </>
      )}

      <ProgressRail
        book={book}
        th={th}
        pos={pos}
        compact={compact}
        botInset={botInset}
        onScrub={
          st.pageMode === 'paged'
            ? (p) => goPage(Math.round(p * (pageCount - 1)))
            : (p) => {
                commitPos(p);
                if (scrollRef.current) {
                  const el = scrollRef.current;
                  el.scrollTop = (el.scrollHeight - el.clientHeight) * p;
                }
              }
        }
      />

      {overlay === 'settings' && (
        <SettingsSheet
          th={th}
          st={st}
          set={set}
          compact={compact}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'toc' && (
        <TOCPanel
          book={book}
          th={th}
          pos={pos}
          compact={compact}
          onJump={(p) => {
            if (st.pageMode === 'paged') {
              seeded.current = true;
              setPage(Math.round(p * (pageCount - 1)));
            }
            commitPos(p);
          }}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

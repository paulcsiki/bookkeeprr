'use client';

import {
  type CSSProperties,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type BookData,
  type ReaderThemeKey,
  type ReaderTheme,
  READER_THEMES,
  T,
  THEME_ORDER,
  chapterAt,
  inkA,
  pageAt,
} from './data';
import { RIcon } from './icons';

// ──────────────────────────────────────────────────────────────
// Keyframes used by the reader chrome — injected once on mount.
// ──────────────────────────────────────────────────────────────
const KEYFRAMES_ID = 'rd-chrome-anim';
export function ensureReaderKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const s = document.createElement('style');
  s.id = KEYFRAMES_ID;
  s.textContent = `
    @keyframes rd-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes rd-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
    @keyframes rd-slide-left { from { transform: translateX(-100%); } to { transform: translateX(0); } }
    @keyframes rd-slide-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @keyframes rd-page-in { from { opacity: 0; transform: translateX(var(--rd-from, 12px)); } to { opacity: 1; transform: translateX(0); } }
  `;
  document.head.appendChild(s);
}

// ── round chrome button ────────────────────────────────────
function CBtn({
  name,
  th,
  onClick,
  active,
  size = 19,
  label,
  stroke = 1.7,
  fill = false,
}: {
  name: string;
  th: ReaderTheme;
  onClick?: () => void;
  active?: boolean;
  size?: number;
  label?: string;
  stroke?: number;
  fill?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        border: 'none',
        cursor: 'pointer',
        background: active ? th.accent : 'transparent',
        position: 'relative',
        color: active ? (th.dark ? '#0a0a0e' : '#fff') : th.inkSoft,
        display: 'grid',
        placeItems: 'center',
        transition: 'background .15s, color .15s',
      }}
    >
      <RIcon name={name} size={size} stroke={stroke} fill={fill} />
    </button>
  );
}

// ──────────────────────────────────────────────────────────────
// TOP BAR — back · centre title/chapter · actions. Hides in immersive mode.
// ──────────────────────────────────────────────────────────────
export function ReaderTopBar({
  book,
  th,
  chapter,
  compact = false,
  onTOC,
  onSettings,
  onBookmark,
  onFullscreen,
  bookmarked,
  fs = false,
  hidden = false,
  floating = false,
  topInset,
}: {
  book: BookData;
  th: ReaderTheme;
  chapter?: { title: string };
  compact?: boolean;
  onTOC?: () => void;
  onSettings?: () => void;
  onBookmark?: () => void;
  onFullscreen?: () => void;
  bookmarked: boolean;
  fs?: boolean;
  hidden?: boolean;
  floating?: boolean;
  topInset?: number;
}): JSX.Element {
  const padTop = topInset != null ? topInset : compact ? 46 : 12;

  if (floating) {
    return (
      <>
        <div
          style={{
            position: 'absolute',
            top: padTop + 4,
            left: 0,
            right: 0,
            zIndex: 30,
            display: 'flex',
            justifyContent: 'center',
            transition: 'opacity .28s, transform .28s',
            opacity: hidden ? 0 : 1,
            transform: hidden ? 'translateY(-10px)' : 'none',
            pointerEvents: hidden ? 'none' : 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: th.chrome2,
              border: `1px solid ${th.line}`,
              borderRadius: 99,
              padding: '6px 14px',
              boxShadow: `0 6px 18px ${inkA(th, 0.16)}`,
              maxWidth: '76%',
            }}
          >
            <RIcon name="chevL" size={16} color={th.inkSoft} />
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: th.ink,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {book.title}
            </span>
            <span style={{ fontFamily: T.fontMono, fontSize: 10, color: th.faint }}>
              {chapter ? `· ${chapter.title.split(/[·.:]/)[0]!.trim()}` : ''}
            </span>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: compact ? 74 : 64,
            left: 0,
            right: 0,
            zIndex: 31,
            display: 'flex',
            justifyContent: 'center',
            transition: 'opacity .28s, transform .28s',
            opacity: hidden ? 0 : 1,
            transform: hidden ? 'translateY(12px)' : 'none',
            pointerEvents: hidden ? 'none' : 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              background: th.chrome2,
              border: `1px solid ${th.line}`,
              borderRadius: 99,
              padding: 4,
              boxShadow: `0 10px 28px ${inkA(th, 0.22)}`,
            }}
          >
            <CBtn
              name="bookmark"
              th={th}
              onClick={onBookmark}
              active={bookmarked}
              size={17}
              fill={bookmarked}
              label="Bookmark"
            />
            <CBtn name="list" th={th} onClick={onTOC} size={19} label="Contents" />
            <CBtn name="aa" th={th} onClick={onSettings} size={20} label="Display" />
            {!compact && (
              <CBtn
                name={fs ? 'shrink' : 'expand'}
                th={th}
                onClick={onFullscreen}
                size={18}
                label="Fullscreen"
              />
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        paddingTop: padTop,
        background: `linear-gradient(${th.chrome} 62%, ${th.chrome}00)`,
        transition: 'opacity .28s ease, transform .28s ease',
        opacity: hidden ? 0 : 1,
        transform: hidden ? 'translateY(-12px)' : 'none',
        pointerEvents: hidden ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '0 10px 12px' : '0 14px 12px',
        }}
      >
        <CBtn name="chevL" th={th} size={22} label="Back" />
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '0 4px' }}>
          <div
            style={{
              fontFamily: T.fontDisplay,
              fontWeight: 600,
              fontSize: compact ? 14 : 15,
              color: th.ink,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {book.title}
            {book.vol ? (
              <span style={{ color: th.inkSoft, fontWeight: 500 }}> · {book.vol}</span>
            ) : null}
          </div>
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: 10,
              color: th.inkSoft,
              letterSpacing: '0.04em',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {chapter ? chapter.title : book.author}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CBtn
            name="bookmark"
            th={th}
            onClick={onBookmark}
            active={bookmarked}
            size={17}
            label="Bookmark"
            fill={bookmarked}
          />
          {!compact && <CBtn name="list" th={th} onClick={onTOC} size={19} label="Contents" />}
          <CBtn name="aa" th={th} onClick={onSettings} size={20} label="Display" />
          {!compact && (
            <CBtn
              name={fs ? 'shrink' : 'expand'}
              th={th}
              onClick={onFullscreen}
              size={18}
              label="Fullscreen"
            />
          )}
          {compact && <CBtn name="list" th={th} onClick={onTOC} size={19} label="Contents" />}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// PROGRESS RAIL — always visible; chapter ticks + scrub thumbnail.
// ──────────────────────────────────────────────────────────────
export function ProgressRail({
  book,
  th,
  pos,
  compact = false,
  onScrub,
  botInset,
}: {
  book: BookData;
  th: ReaderTheme;
  pos: number;
  compact?: boolean;
  onScrub?: (p: number) => void;
  botInset?: number;
}): JSX.Element {
  const railRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const ticks = book.chapters.map((c) => (c.start - 1) / book.totalPages);

  const scrubAt = (clientX: number) => {
    if (!railRef.current) return;
    const r = railRef.current.getBoundingClientRect();
    if (r.width <= 0) return;
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    setDrag(f);
    onScrub?.(f);
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    scrubAt(e.clientX);
    const mv = (ev: PointerEvent) => scrubAt(ev.clientX);
    const up = () => {
      setDrag(null);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const shown = drag != null ? drag : pos;
  const scrubbing = drag != null;
  const ch = chapterAt(book, shown);
  const bubbleLeft = Math.max(13, Math.min(87, shown * 100));

  const thumb = (
    <div
      style={{
        width: 38,
        height: 52,
        borderRadius: 5,
        flexShrink: 0,
        background: th.page,
        border: `1px solid ${inkA(th, 0.18)}`,
        padding: '6px 5px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        overflow: 'hidden',
      }}
    >
      {[1, 0.82, 0.92, 0.7, 0.88, 0.6].map((w, i) => (
        <div
          key={i}
          style={{
            height: 2.4,
            width: `${w * 100}%`,
            borderRadius: 1,
            background: inkA(th, i === 0 ? 0.42 : 0.26),
          }}
        />
      ))}
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        paddingBottom: botInset != null ? botInset : compact ? 26 : 12,
        paddingTop: 10,
        background: `linear-gradient(${th.chrome}00, ${th.chrome} 42%)`,
      }}
    >
      <div style={{ padding: compact ? '0 16px' : '0 22px', position: 'relative' }}>
        {scrubbing && (
          <div
            style={{
              position: 'absolute',
              left: `${bubbleLeft}%`,
              bottom: '100%',
              transform: 'translateX(-50%)',
              marginBottom: 4,
              zIndex: 5,
              pointerEvents: 'none',
              animation: 'rd-fade .14s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 8,
                paddingRight: 13,
                background: th.chrome2,
                border: `1px solid ${th.line2}`,
                borderRadius: 13,
                boxShadow: `0 12px 30px ${inkA(th, 0.3)}`,
                maxWidth: 240,
              }}
            >
              {thumb}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: T.fontMono,
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: th.faint,
                    marginBottom: 3,
                  }}
                >
                  Ch. {ch.i + 1}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: th.ink,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 150,
                  }}
                >
                  {ch.title.split(/[·]/).slice(-1)[0]!.trim()}
                </div>
                <div
                  style={{
                    fontFamily: T.fontMono,
                    fontSize: 10,
                    color: th.accent,
                    marginTop: 3,
                    letterSpacing: '0.02em',
                  }}
                >
                  p.{pageAt(book, shown)} · {Math.round(shown * 100)}%
                </div>
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '100%',
                transform: 'translateX(-50%) rotate(45deg)',
                width: 9,
                height: 9,
                marginTop: -5,
                background: th.chrome2,
                borderRight: `1px solid ${th.line2}`,
                borderBottom: `1px solid ${th.line2}`,
                borderRadius: 2,
              }}
            />
          </div>
        )}
        <div
          ref={railRef}
          onPointerDown={onDown}
          style={{
            position: 'relative',
            height: 18,
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            touchAction: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 3,
              borderRadius: 99,
              background: inkA(th, th.dark ? 0.16 : 0.12),
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: `${shown * 100}%`,
              height: 3,
              borderRadius: 99,
              background: th.accent,
            }}
          />
          {ticks.map((t, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${t * 100}%`,
                width: 1.5,
                height: 7,
                background: inkA(th, th.dark ? 0.28 : 0.22),
                transform: 'translateX(-50%)',
              }}
            />
          ))}
          <span
            style={{
              position: 'absolute',
              left: `${shown * 100}%`,
              transform: `translateX(-50%) scale(${scrubbing ? 1.25 : 1})`,
              width: 13,
              height: 13,
              borderRadius: 99,
              background: th.accent,
              boxShadow: `0 1px 4px ${inkA(th, 0.4)}, 0 0 0 3px ${th.chrome}`,
              transition: 'transform .12s ease',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontFamily: T.fontMono,
            fontSize: 10,
            letterSpacing: '0.03em',
            color: th.inkSoft,
          }}
        >
          <span>Page {pageAt(book, pos)}</span>
          <span>
            {book.totalPages - pageAt(book, pos)} left · {Math.round(pos * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// SETTINGS SHEET — themes, brightness, warmth, type-specific display controls.
// ──────────────────────────────────────────────────────────────

export type FontKey = 'serif' | 'sans' | 'mono' | 'dys';
export type PageMode = 'paged' | 'scroll';

export interface TextSettingsState {
  theme: ReaderThemeKey;
  auto: boolean;
  brightness: number;
  warmth: number;
  fontSize: number;
  lineH: number;
  font: FontKey;
  pageMode: PageMode;
  spread: boolean;
}

function Sub({ th, children }: { th: ReaderTheme; children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontFamily: T.fontMono,
        fontSize: 9.5,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: th.faint,
        margin: '18px 0 9px',
      }}
    >
      {children}
    </div>
  );
}

function Stepper({
  th,
  label,
  display,
  onMinus,
  onPlus,
}: {
  th: ReaderTheme;
  label: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
}): JSX.Element {
  const btn: CSSProperties = {
    width: 34,
    height: 30,
    border: 'none',
    background: 'transparent',
    color: th.ink,
    cursor: 'pointer',
    fontSize: 18,
    borderRadius: 7,
    display: 'grid',
    placeItems: 'center',
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
      }}
    >
      <span style={{ fontSize: 13.5, color: th.ink, fontWeight: 500 }}>{label}</span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: inkA(th, th.dark ? 0.08 : 0.05),
          borderRadius: 9,
          padding: 3,
        }}
      >
        <button type="button" onClick={onMinus} aria-label={`Decrease ${label}`} style={btn}>
          –
        </button>
        <span
          style={{
            minWidth: 52,
            textAlign: 'center',
            fontFamily: T.fontMono,
            fontSize: 12,
            color: th.inkSoft,
          }}
        >
          {display}
        </span>
        <button type="button" onClick={onPlus} aria-label={`Increase ${label}`} style={btn}>
          +
        </button>
      </div>
    </div>
  );
}

interface SegOption {
  k: string;
  label: string;
  icon?: string;
}
function SegRow({
  th,
  options,
  value,
  onPick,
}: {
  th: ReaderTheme;
  options: SegOption[];
  value: string;
  onPick: (k: string) => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        background: inkA(th, th.dark ? 0.08 : 0.05),
        borderRadius: 10,
        padding: 4,
      }}
    >
      {options.map((o) => {
        const on = o.k === value;
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => onPick(o.k)}
            style={{
              flex: 1,
              height: 38,
              border: 'none',
              borderRadius: 7,
              cursor: 'pointer',
              background: on ? th.page : 'transparent',
              color: on ? th.accent : th.inkSoft,
              boxShadow: on ? `0 1px 3px ${inkA(th, 0.18)}` : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: T.fontBody,
              transition: 'all .12s',
            }}
          >
            {o.icon && <RIcon name={o.icon} size={17} stroke={on ? 2 : 1.7} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MiniSlider({
  th,
  value,
  onChange,
  leftIcon,
  rightIcon,
}: {
  th: ReaderTheme;
  value: number;
  onChange: (v: number) => void;
  leftIcon: string;
  rightIcon: string;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const setFromEvent = (clientX: number) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (r.width <= 0) return;
    onChange(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    setFromEvent(e.clientX);
    const mv = (ev: PointerEvent) => setFromEvent(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <RIcon name={leftIcon} size={16} color={th.inkSoft} />
      <div
        ref={ref}
        onPointerDown={down}
        style={{
          flex: 1,
          position: 'relative',
          height: 22,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 5,
            borderRadius: 99,
            background: inkA(th, th.dark ? 0.14 : 0.1),
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${value * 100}%`,
            height: 5,
            borderRadius: 99,
            background: th.accent,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: `${value * 100}%`,
            transform: 'translateX(-50%)',
            width: 18,
            height: 18,
            borderRadius: 99,
            background: th.page,
            boxShadow: `0 1px 4px ${inkA(th, 0.35)}, 0 0 0 1px ${inkA(th, 0.12)}`,
          }}
        />
      </div>
      <RIcon name={rightIcon} size={19} color={th.inkSoft} />
    </div>
  );
}

function Switch({
  th,
  on,
  onClick,
}: {
  th: ReaderTheme;
  on: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        width: 38,
        height: 22,
        borderRadius: 99,
        border: 'none',
        cursor: 'pointer',
        background: on ? th.accent : inkA(th, 0.18),
        position: 'relative',
        transition: 'background .15s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: 99,
          background: '#fff',
          transition: 'left .16s',
          boxShadow: `0 1px 3px ${inkA(th, 0.35)}`,
        }}
      />
    </button>
  );
}

export function SettingsSheet({
  th,
  st,
  set,
  compact = false,
  onClose,
}: {
  th: ReaderTheme;
  st: TextSettingsState;
  set: <K extends keyof TextSettingsState>(k: K, v: TextSettingsState[K]) => void;
  compact?: boolean;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  const onBackdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  return (
    <div
      onClick={onBackdropClick}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: inkA(th, 0.28),
        backdropFilter: 'blur(2px)',
        animation: 'rd-fade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: th.chrome,
          borderTop: `1px solid ${th.line}`,
          borderRadius: '20px 20px 0 0',
          padding: compact ? '10px 18px 30px' : '12px 22px 22px',
          maxWidth: compact ? 'none' : 460,
          width: '100%',
          margin: '0 auto',
          boxShadow: `0 -16px 40px ${inkA(th, 0.18)}`,
          animation: 'rd-slide-up .26s cubic-bezier(.16,1,.3,1)',
          maxHeight: '92%',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 99,
            background: inkA(th, 0.18),
            margin: '4px auto 6px',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: T.fontDisplay,
              fontSize: 16,
              fontWeight: 600,
              color: th.ink,
              letterSpacing: '-0.01em',
            }}
          >
            Display
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: th.inkSoft,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <RIcon name="close" size={18} />
          </button>
        </div>

        <Sub th={th}>Theme</Sub>
        <div style={{ display: 'flex', gap: 10 }}>
          {THEME_ORDER.map((k) => {
            const tt = READER_THEMES[k];
            const on = k === th.key;
            return (
              <button
                key={k}
                type="button"
                aria-label={`${tt.label} theme`}
                onClick={() => set('theme', k)}
                style={{
                  flex: 1,
                  cursor: 'pointer',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                }}
              >
                <div
                  style={{
                    height: 52,
                    borderRadius: 11,
                    background: tt.swatch,
                    border: `2px solid ${on ? th.accent : inkA(th, 0.16)}`,
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: on ? `0 0 0 3px ${th.accent}33` : 'none',
                  }}
                >
                  <span
                    style={{
                      fontFamily: T.fontDisplay,
                      fontSize: 17,
                      fontWeight: 600,
                      color: tt.ink,
                    }}
                  >
                    Aa
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    marginTop: 6,
                    color: on ? th.accent : th.inkSoft,
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  {tt.label}
                </div>
              </button>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: T.fontMono,
            fontSize: 10,
            color: th.faint,
            letterSpacing: '0.04em',
          }}
        >
          <RIcon name={st.auto ? 'contrast' : 'sun'} size={13} color={th.faint} />
          <span style={{ flex: 1 }}>Auto — match system appearance</span>
          <Switch th={th} on={st.auto} onClick={() => set('auto', !st.auto)} />
        </div>

        <Sub th={th}>Brightness &amp; warmth</Sub>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <MiniSlider
            th={th}
            value={st.brightness}
            onChange={(v) => set('brightness', v)}
            leftIcon="brightness"
            rightIcon="brightness"
          />
          <MiniSlider
            th={th}
            value={st.warmth}
            onChange={(v) => set('warmth', v)}
            leftIcon="warmth"
            rightIcon="sun"
          />
        </div>

        <Sub th={th}>Text</Sub>
        <Stepper
          th={th}
          label="Font size"
          display={`${st.fontSize}pt`}
          onMinus={() => set('fontSize', Math.max(13, st.fontSize - 1))}
          onPlus={() => set('fontSize', Math.min(28, st.fontSize + 1))}
        />
        <Stepper
          th={th}
          label="Line spacing"
          display={st.lineH.toFixed(2)}
          onMinus={() => set('lineH', Math.max(1.3, +(st.lineH - 0.05).toFixed(2)))}
          onPlus={() => set('lineH', Math.min(2.2, +(st.lineH + 0.05).toFixed(2)))}
        />
        <div style={{ padding: '10px 0' }}>
          <SegRow
            th={th}
            value={st.font}
            onPick={(v) => set('font', v as FontKey)}
            options={[
              { k: 'serif', label: 'Serif' },
              { k: 'sans', label: 'Sans' },
              { k: 'mono', label: 'Mono' },
              { k: 'dys', label: 'Dyslexic' },
            ]}
          />
        </div>
        <Sub th={th}>Layout</Sub>
        <SegRow
          th={th}
          value={st.pageMode}
          onPick={(v) => set('pageMode', v as PageMode)}
          options={[
            { k: 'paged', label: 'Paged', icon: 'single' },
            { k: 'scroll', label: 'Scroll', icon: 'scroll' },
          ]}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// TABLE OF CONTENTS — slide-in panel; chapters with jump-to.
// ──────────────────────────────────────────────────────────────
export function TOCPanel({
  book,
  th,
  pos,
  compact = false,
  onJump,
  onClose,
}: {
  book: BookData;
  th: ReaderTheme;
  pos: number;
  compact?: boolean;
  onJump: (p: number) => void;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  const cur = chapterAt(book, pos);
  const onBackdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  return (
    <div
      onClick={onBackdropClick}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 55,
        display: 'flex',
        justifyContent: 'flex-start',
        background: inkA(th, 0.28),
        backdropFilter: 'blur(2px)',
        animation: 'rd-fade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: compact ? '86%' : 360,
          maxWidth: '92%',
          height: '100%',
          background: th.chrome,
          borderRight: `1px solid ${th.line}`,
          display: 'flex',
          flexDirection: 'column',
          animation: 'rd-slide-left .28s cubic-bezier(.16,1,.3,1)',
          boxShadow: `0 0 50px ${inkA(th, 0.25)}`,
        }}
      >
        <div style={{ padding: compact ? '46px 18px 10px' : '18px 18px 10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <span
              style={{ fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 600, color: th.ink }}
            >
              {book.title}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                border: 'none',
                background: 'transparent',
                color: th.inkSoft,
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <RIcon name="close" size={18} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 20px' }}>
          {book.chapters.map((c) => {
            const isCur = c.i === cur.i;
            const chPos = (c.start - 1) / book.totalPages;
            return (
              <button
                key={c.i}
                type="button"
                onClick={() => {
                  onJump(chPos + 0.001);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  padding: '11px 12px',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 10,
                  background: isCur ? inkA(th, th.dark ? 0.1 : 0.06) : 'transparent',
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: T.fontMono,
                    fontSize: 11,
                    color: isCur ? th.accent : th.faint,
                    minWidth: 22,
                  }}
                >
                  {String(c.i + 1).padStart(2, '0')}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13.5,
                    color: isCur ? th.ink : th.inkSoft,
                    fontWeight: isCur ? 600 : 400,
                    lineHeight: 1.3,
                  }}
                >
                  {c.title}
                </span>
                <span style={{ fontFamily: T.fontMono, fontSize: 10, color: th.faint }}>
                  p.{c.start}
                </span>
                {isCur && (
                  <span
                    style={{ width: 6, height: 6, borderRadius: 99, background: th.accent }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Page-turn nav arrow style helper.
export function navArrowStyle(
  th: ReaderTheme,
  side: 'left' | 'right',
  disabled: boolean,
): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 10,
    transform: 'translateY(-50%)',
    zIndex: 25,
    width: 42,
    height: 42,
    borderRadius: 99,
    border: 'none',
    background: 'transparent',
    color: th.inkSoft,
    cursor: disabled ? 'default' : 'pointer',
    display: 'grid',
    placeItems: 'center',
    opacity: disabled ? 0.25 : 0.7,
  };
}


'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { READER_THEME_KEYS, type ReaderThemeKey } from './lib/reader-theme';
import { RIcon } from './icons';
import { accentA, inkA } from './lib/colors';
import { ensureReaderKeyframes } from './anim';

export type ReaderFontKey = 'serif' | 'sans' | 'mono' | 'dys';
export type ReaderPageMode = 'paged' | 'scroll';
export type ReaderSpread = 'single' | 'double' | 'webtoon';
export type ReaderDir = 'rtl' | 'ltr';
export type ReaderChromeMode = 'bar' | 'floating';

/** The full settings shape the sheet reads + mutates via `set`. */
export interface SettingsState {
  theme: ReaderThemeKey;
  auto: boolean;
  brightness: number;
  warmth: number;
  fontSize: number;
  lineH: number;
  font: ReaderFontKey;
  pageMode: ReaderPageMode;
  spread: ReaderSpread;
  dir: ReaderDir;
  chromeMode: ReaderChromeMode;
}

export type SettingsSetter = <K extends keyof SettingsState>(
  key: K,
  value: SettingsState[K],
) => void;

const THEME_LABELS: Record<ReaderThemeKey, string> = {
  paper: 'Paper',
  sepia: 'Sepia',
  dark: 'Dark',
  oled: 'OLED',
};

function Sub({ children }: { children: ReactNode }) {
  return (
    <div
      className="font-mono"
      style={{
        fontSize: 9.5,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--reader-faint)',
        margin: '18px 0 9px',
      }}
    >
      {children}
    </div>
  );
}

function Stepper({
  label,
  display,
  onMinus,
  onPlus,
}: {
  label: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const btn: CSSProperties = {
    width: 34,
    height: 30,
    border: 'none',
    background: 'transparent',
    color: 'var(--reader-ink)',
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
      <span style={{ fontSize: 13.5, color: 'var(--reader-ink)', fontWeight: 500 }}>{label}</span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: inkA(0.06),
          borderRadius: 9,
          padding: 3,
        }}
      >
        <button type="button" onClick={onMinus} aria-label={`Decrease ${label.toLowerCase()}`} style={btn}>
          –
        </button>
        <span
          className="font-mono"
          style={{ minWidth: 52, textAlign: 'center', fontSize: 12, color: 'var(--reader-ink-soft)' }}
        >
          {display}
        </span>
        <button type="button" onClick={onPlus} aria-label={`Increase ${label.toLowerCase()}`} style={btn}>
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
  options,
  value,
  onPick,
}: {
  options: SegOption[];
  value: string;
  onPick: (k: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, background: inkA(0.06), borderRadius: 10, padding: 4 }}>
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
              background: on ? 'var(--reader-page)' : 'transparent',
              color: on ? 'var(--reader-accent)' : 'var(--reader-ink-soft)',
              boxShadow: on ? `0 1px 3px ${inkA(0.18)}` : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              fontSize: 11,
              fontWeight: 600,
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
  value,
  onChange,
  leftIcon,
  rightIcon,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  leftIcon: string;
  rightIcon: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (clientX: number) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (r.width <= 0) return;
    onChange(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };
  const down = (e: React.PointerEvent) => {
    set(e.clientX);
    const mv = (ev: PointerEvent) => set(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <RIcon name={leftIcon} size={16} color="var(--reader-ink-soft)" />
      <div
        ref={ref}
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
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
            background: inkA(0.12),
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${value * 100}%`,
            height: 5,
            borderRadius: 99,
            background: 'var(--reader-accent)',
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
            background: 'var(--reader-page)',
            boxShadow: `0 1px 4px ${inkA(0.35)}, 0 0 0 1px ${inkA(0.12)}`,
          }}
        />
      </div>
      <RIcon name={rightIcon} size={19} color="var(--reader-ink-soft)" />
    </div>
  );
}

export function Switch({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      style={{
        width: 38,
        height: 22,
        borderRadius: 99,
        border: 'none',
        cursor: 'pointer',
        background: on ? 'var(--reader-accent)' : inkA(0.18),
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
          background: 'var(--reader-page)',
          transition: 'left .16s',
          boxShadow: `0 1px 3px ${inkA(0.35)}`,
        }}
      />
    </button>
  );
}

export interface SettingsSheetProps {
  st: SettingsState;
  set: SettingsSetter;
  /** Which reader kind drives the type-specific section. */
  kind: 'text' | 'comics' | 'audio';
  compact?: boolean;
  onClose: () => void;
}

/**
 * Display settings bottom sheet — theme swatches, brightness + warmth sliders,
 * Auto switch, and kind-specific controls (text: font size / spacing / font /
 * page-mode; comics: spread / direction). Driven by an `st`/`set` pair.
 * All colors are `--reader-*` tokens; each swatch previews its theme by being
 * scoped under its own `data-reader-theme`.
 */
export function SettingsSheet({ st, set, kind, compact = false, onClose }: SettingsSheetProps) {
  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  const text = kind === 'text';
  const comics = kind === 'comics';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: inkA(0.28),
        backdropFilter: 'blur(2px)',
        animation: 'rd-fade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--reader-chrome)',
          borderTop: `1px solid var(--reader-line)`,
          borderRadius: '20px 20px 0 0',
          padding: compact ? '10px 18px 30px' : '12px 22px 22px',
          maxWidth: compact ? 'none' : 460,
          width: '100%',
          margin: '0 auto',
          boxShadow: `0 -16px 40px ${inkA(0.18)}`,
          animation: 'rd-slide-up .26s cubic-bezier(.16,1,.3,1)',
          maxHeight: '92%',
          overflowY: 'auto',
        }}
      >
        <div
          style={{ width: 40, height: 4, borderRadius: 99, background: inkA(0.18), margin: '4px auto 6px' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            className="font-display"
            style={{ fontSize: 16, fontWeight: 600, color: 'var(--reader-ink)', letterSpacing: '-0.01em' }}
          >
            Display
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', color: 'var(--reader-ink-soft)', cursor: 'pointer', padding: 4 }}
          >
            <RIcon name="close" size={18} />
          </button>
        </div>

        <Sub>Theme</Sub>
        <div style={{ display: 'flex', gap: 10 }}>
          {READER_THEME_KEYS.map((k) => {
            const on = k === st.theme && !st.auto;
            return (
              <button
                key={k}
                type="button"
                aria-label={`${THEME_LABELS[k]} theme`}
                onClick={() => set('theme', k)}
                style={{ flex: 1, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0 }}
              >
                <div
                  data-reader-theme={k}
                  style={{
                    height: 52,
                    borderRadius: 11,
                    background: 'var(--reader-page)',
                    border: `2px solid ${on ? 'var(--reader-accent)' : inkA(0.16)}`,
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: on ? `0 0 0 3px ${accentA(0.2)}` : 'none',
                  }}
                >
                  <span
                    className="font-display"
                    style={{ fontSize: 17, fontWeight: 600, color: 'var(--reader-ink)' }}
                  >
                    Aa
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    marginTop: 6,
                    color: on ? 'var(--reader-accent)' : 'var(--reader-ink-soft)',
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  {THEME_LABELS[k]}
                </div>
              </button>
            );
          })}
        </div>
        <div
          className="font-mono"
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            color: 'var(--reader-faint)',
            letterSpacing: '0.04em',
          }}
        >
          <RIcon name={st.auto ? 'contrast' : 'sun'} size={13} color="var(--reader-faint)" />
          <span style={{ flex: 1 }}>Auto — match system appearance</span>
          <Switch on={st.auto} onClick={() => set('auto', !st.auto)} label="Auto appearance" />
        </div>

        <Sub>Brightness &amp; warmth</Sub>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <MiniSlider
            value={st.brightness}
            onChange={(v) => set('brightness', v)}
            leftIcon="brightness"
            rightIcon="brightness"
            label="Brightness"
          />
          <MiniSlider
            value={st.warmth}
            onChange={(v) => set('warmth', v)}
            leftIcon="warmth"
            rightIcon="sun"
            label="Warmth"
          />
        </div>

        <Sub>Chrome</Sub>
        <SegRow
          value={st.chromeMode}
          onPick={(v) => set('chromeMode', v as ReaderChromeMode)}
          options={[
            { k: 'bar', label: 'Bar' },
            { k: 'floating', label: 'Floating' },
          ]}
        />

        {text && (
          <>
            <Sub>Text</Sub>
            <Stepper
              label="Font size"
              display={`${st.fontSize}pt`}
              onMinus={() => set('fontSize', Math.max(13, st.fontSize - 1))}
              onPlus={() => set('fontSize', Math.min(28, st.fontSize + 1))}
            />
            <Stepper
              label="Line spacing"
              display={st.lineH.toFixed(2)}
              onMinus={() => set('lineH', Math.max(1.3, +(st.lineH - 0.05).toFixed(2)))}
              onPlus={() => set('lineH', Math.min(2.2, +(st.lineH + 0.05).toFixed(2)))}
            />
            <div style={{ padding: '10px 0' }}>
              <SegRow
                value={st.font}
                onPick={(v) => set('font', v as ReaderFontKey)}
                options={[
                  { k: 'serif', label: 'Serif' },
                  { k: 'sans', label: 'Sans' },
                  { k: 'mono', label: 'Mono' },
                  { k: 'dys', label: 'Dyslexic' },
                ]}
              />
            </div>
            <Sub>Layout</Sub>
            <SegRow
              value={st.pageMode}
              onPick={(v) => set('pageMode', v as ReaderPageMode)}
              options={[
                { k: 'paged', label: 'Paged', icon: 'single' },
                { k: 'scroll', label: 'Scroll', icon: 'scroll' },
              ]}
            />
          </>
        )}

        {comics && (
          <>
            <Sub>Layout</Sub>
            <SegRow
              value={st.spread}
              onPick={(v) => set('spread', v as ReaderSpread)}
              options={[
                { k: 'single', label: 'Single', icon: 'single' },
                { k: 'double', label: 'Spread', icon: 'spread' },
                { k: 'webtoon', label: 'Webtoon', icon: 'scroll' },
              ]}
            />
            <Sub>Direction</Sub>
            <SegRow
              value={st.dir}
              onPick={(v) => set('dir', v as ReaderDir)}
              options={[
                { k: 'rtl', label: 'Right → left', icon: 'rtl' },
                { k: 'ltr', label: 'Left → right', icon: 'ltr' },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}

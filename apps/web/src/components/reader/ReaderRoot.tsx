'use client';

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  resolveAutoTheme,
  type ReaderThemeKey,
} from './lib/reader-theme';
import {
  loadReaderSettings,
  saveReaderSettings,
  saveReaderSettingsDebounced,
  type ReaderSettingsKind,
} from './lib/reader-settings-storage';
import { ReaderThemeContext, type ReaderThemeState } from './ReaderContext';

const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

export interface ReaderRootProps {
  children: ReactNode;
  /** Initial chosen theme. */
  initialTheme?: ReaderThemeKey;
  /** Whether the active theme follows the OS color scheme. */
  initialAuto?: boolean;
  /** SSR-safe seed for the OS scheme, used until the client mounts the listener. */
  initialPrefersDark?: boolean;
  initialBrightness?: number;
  initialWarmth?: number;
  /**
   * When set, hydrate theme / auto / brightness / warmth from the per-browser
   * store for this reader kind after mount, and persist user changes back.
   * Hydration happens in an effect (not the useState initializer) because the
   * `(reader)` pages are server components — this client tree is still
   * server-rendered to HTML, and `data-reader-theme` + the overlay divs depend
   * on this state, so reading localStorage during the first render would
   * mismatch the server markup. This mirrors `ModeProvider` in `@bookkeeprr/ui`.
   */
  persistKind?: ReaderSettingsKind;
  className?: string;
  style?: CSSProperties;
  /** Optional test hook applied to the themed root element. */
  dataTestId?: string;
}

/**
 * The root of any reader surface. Holds the page-theme / brightness / warmth
 * state, resolves the effective theme (following the OS scheme when `auto`),
 * sets `data-reader-theme` so the `--reader-*` tokens apply, and paints the
 * brightness + warmth overlays. Provides the reader-theme context.
 *
 * Colors are sourced from `--reader-*` tokens only. The two literal overlay
 * colors below (pure black dimmer + warm multiply) are intentional optical
 * filters that sit ABOVE the themed surface, not theme tokens — they match the
 * design prototype exactly and are independent of the page palette.
 */
export function ReaderRoot({
  children,
  initialTheme = 'paper',
  initialAuto = true,
  initialPrefersDark = false,
  initialBrightness = 1,
  initialWarmth = 0,
  persistKind,
  className,
  style,
  dataTestId,
}: ReaderRootProps) {
  const [themeKey, setTheme] = useState<ReaderThemeKey>(initialTheme);
  const [auto, setAuto] = useState<boolean>(initialAuto);
  const [brightness, setBrightness] = useState<number>(initialBrightness);
  const [warmth, setWarmth] = useState<number>(initialWarmth);
  const [prefersDark, setPrefersDark] = useState<boolean>(initialPrefersDark);

  // Hydrate persisted display settings once, after mount (see `persistKind`
  // docs for why this is an effect, not a useState initializer). Absent fields
  // leave the per-content-type seeds in place.
  useEffect(() => {
    if (!persistKind) return;
    const stored = loadReaderSettings(persistKind);
    if (stored.themeKey !== undefined) setTheme(stored.themeKey);
    if (stored.auto !== undefined) setAuto(stored.auto);
    if (stored.brightness !== undefined) setBrightness(stored.brightness);
    if (stored.warmth !== undefined) setWarmth(stored.warmth);
  }, [persistKind]);

  // Track the OS color scheme only while in Auto mode.
  useEffect(() => {
    if (!auto || typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(PREFERS_DARK_QUERY);
    setPrefersDark(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [auto]);

  const effectiveTheme: ReaderThemeKey = auto
    ? resolveAutoTheme(prefersDark)
    : themeKey;

  const ctx = useMemo<ReaderThemeState>(
    () => ({
      themeKey,
      auto,
      brightness,
      warmth,
      setTheme: (key) => {
        setAuto(false);
        setTheme(key);
        // Persist the theme only on an explicit user pick, so the
        // per-content-type seed keeps applying for users who never chose.
        if (persistKind) saveReaderSettings(persistKind, { themeKey: key, auto: false });
      },
      setAuto: (value) => {
        setAuto(value);
        if (persistKind) saveReaderSettings(persistKind, { auto: value });
      },
      setBrightness: (value) => {
        setBrightness(value);
        // Slider-driven — debounce so a drag doesn't write per pointer-move.
        if (persistKind) saveReaderSettingsDebounced(persistKind, { brightness: value });
      },
      setWarmth: (value) => {
        setWarmth(value);
        if (persistKind) saveReaderSettingsDebounced(persistKind, { warmth: value });
      },
    }),
    [themeKey, auto, brightness, warmth, persistKind],
  );

  const rootStyle: CSSProperties = {
    position: 'relative',
    background: 'var(--reader-page)',
    color: 'var(--reader-ink)',
    ...style,
  };

  const showBrightness = brightness < 1;
  const showWarmth = warmth > 0;

  return (
    <ReaderThemeContext.Provider value={ctx}>
      <div
        data-reader-theme={effectiveTheme}
        data-testid={dataTestId}
        className={className}
        style={rootStyle}
      >
        {children}
        {showBrightness && (
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
        {showWarmth && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 40,
              background: 'hsl(34 90% 50%)',
              mixBlendMode: 'multiply',
              opacity: warmth * 0.5,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </ReaderThemeContext.Provider>
  );
}

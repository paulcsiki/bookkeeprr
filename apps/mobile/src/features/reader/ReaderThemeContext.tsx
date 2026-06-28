import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import {
  readerPalette,
  resolveAutoTheme,
  type ReaderPalette,
  type ReaderThemeKey,
} from '@/theme/reader-themes';
import {
  loadReaderSettings,
  saveReaderSettings,
  type ReaderSettingsKind,
} from './lib/reader-settings';

/**
 * Reader-page theme state for the native readers — the RN equivalent of the
 * web `ReaderContext`. RN has no CSS variables, so the resolved `palette` is a
 * plain JS object the reader surfaces and chrome consume directly. The accent
 * follows the active app primary (paper/dark/oled) or the constant sepia tone.
 */
export interface ReaderThemeState {
  /** The user's chosen theme key (ignored for the active surface when `auto`). */
  themeKey: ReaderThemeKey;
  /** When true the active theme follows the OS color scheme. */
  auto: boolean;
  /** The resolved palette for the *effective* theme (auto-aware). */
  palette: ReaderPalette;
  /** Screen dimming, 0..1 (1 = full brightness, no overlay). */
  brightness: number;
  /** Warm-light overlay strength, 0..1 (0 = off). */
  warmth: number;
  setThemeKey: (key: ReaderThemeKey) => void;
  setAuto: (auto: boolean) => void;
  setBrightness: (brightness: number) => void;
  setWarmth: (warmth: number) => void;
}

const Ctx = createContext<ReaderThemeState | null>(null);

export interface ReaderThemeProviderProps {
  children: ReactNode;
  /**
   * Reader kind whose persisted settings bundle hydrates + receives writes.
   * When omitted (tests/storybook mounts) nothing is loaded or persisted.
   */
  kind?: ReaderSettingsKind;
  /** Initial chosen theme (seeded by content type at the Reader shell). */
  initialThemeKey?: ReaderThemeKey;
  /** Whether the active theme follows the OS color scheme. */
  initialAuto?: boolean;
  initialBrightness?: number;
  initialWarmth?: number;
}

export function ReaderThemeProvider({
  children,
  kind,
  initialThemeKey = 'paper',
  initialAuto = false,
  initialBrightness = 1,
  initialWarmth = 0,
}: ReaderThemeProviderProps) {
  const tokens = useTokens();
  const osScheme = useColorScheme();
  const [themeKey, setThemeKey] = useState<ReaderThemeKey>(initialThemeKey);
  const [auto, setAuto] = useState<boolean>(initialAuto);
  const [brightness, setBrightness] = useState<number>(initialBrightness);
  const [warmth, setWarmth] = useState<number>(initialWarmth);

  // Hydrate persisted values over the initial* seeds. Async on purpose — a
  // brief default flash beats blocking first paint on storage I/O. The
  // persisted themeKey only exists once the user explicitly picked one, so
  // the content-type seed keeps working for users who never chose.
  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    void loadReaderSettings(kind).then((s) => {
      if (cancelled) return;
      if (s.themeKey !== undefined) setThemeKey(s.themeKey);
      if (s.auto !== undefined) setAuto(s.auto);
      if (s.brightness !== undefined) setBrightness(s.brightness);
      if (s.warmth !== undefined) setWarmth(s.warmth);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const effectiveKey: ReaderThemeKey = auto ? resolveAutoTheme(osScheme === 'dark') : themeKey;
  const palette = useMemo(
    () => readerPalette(effectiveKey, tokens.primary),
    [effectiveKey, tokens.primary],
  );

  const value = useMemo<ReaderThemeState>(
    () => ({
      themeKey,
      auto,
      palette,
      brightness,
      warmth,
      setThemeKey: (key) => {
        setAuto(false);
        setThemeKey(key);
        // themeKey persists ONLY here — an explicit user pick. Seeds never do.
        if (kind) saveReaderSettings(kind, { themeKey: key, auto: false });
      },
      setAuto: (v) => {
        setAuto(v);
        if (kind) saveReaderSettings(kind, { auto: v });
      },
      setBrightness: (v) => {
        setBrightness(v);
        if (kind) saveReaderSettings(kind, { brightness: v });
      },
      setWarmth: (v) => {
        setWarmth(v);
        if (kind) saveReaderSettings(kind, { warmth: v });
      },
    }),
    [themeKey, auto, palette, brightness, warmth, kind],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReaderTheme(): ReaderThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useReaderTheme must be used within a <ReaderThemeProvider>');
  return v;
}

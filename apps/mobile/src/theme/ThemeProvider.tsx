import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from '@/lib/secure-storage';
import {
  tokens as TOKEN_MAP,
  ACCENT_THEMES,
  COLOR_SCHEMES,
  type AccentTheme,
  type ColorScheme,
  type Tokens,
} from './tokens';

const STORAGE_KEY = 'bookkeeprr.theme.v1';

interface ThemeState {
  accent: AccentTheme;
  scheme: ColorScheme;
  tokens: Tokens;
  setAccent: (accent: AccentTheme) => void;
  setScheme: (scheme: ColorScheme) => void;
}

const Ctx = createContext<ThemeState | null>(null);

interface Props {
  initialAccent?: AccentTheme;
  initialScheme?: ColorScheme;
  children: ReactNode;
}

function isAccent(value: unknown): value is AccentTheme {
  return typeof value === 'string' && (ACCENT_THEMES as readonly string[]).includes(value);
}

function isScheme(value: unknown): value is ColorScheme {
  return typeof value === 'string' && (COLOR_SCHEMES as readonly string[]).includes(value);
}

export function ThemeProvider({
  initialAccent = 'tsundoku',
  initialScheme = 'dark',
  children,
}: Props) {
  const [accent, setAccent] = useState<AccentTheme>(initialAccent);
  const [scheme, setScheme] = useState<ColorScheme>(initialScheme);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (!cancelled && raw) {
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const p = parsed as { accent?: unknown; scheme?: unknown };
            if (isAccent(p.accent)) setAccent(p.accent);
            if (isScheme(p.scheme)) setScheme(p.scheme);
          }
        }
      } catch {
        /* no-op: persisted theme is best-effort */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ accent, scheme })).catch(() => {
      /* no-op: persisted theme is best-effort */
    });
  }, [accent, scheme, hydrated]);

  const tokensValue = TOKEN_MAP[accent][scheme];
  const value = useMemo<ThemeState>(
    () => ({ accent, scheme, tokens: tokensValue, setAccent, setScheme }),
    [accent, scheme, tokensValue],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}

export function useTokens(): Tokens {
  return useTheme().tokens;
}

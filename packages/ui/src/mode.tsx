'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Mode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'bookkeeprr-mode';

interface Ctx {
  mode: Mode;
  effectiveMode: 'light' | 'dark';
  setMode: (mode: Mode) => void;
}

const ModeContext = createContext<Ctx | null>(null);

function resolveSystem(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function readStored(): Mode {
  if (typeof window === 'undefined') return 'system';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function ModeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setModeState] = useState<Mode>('system');
  const [effectiveMode, setEffectiveMode] = useState<'light' | 'dark'>('dark');

  // Hydration: read persisted value once on mount.
  useEffect(() => {
    const stored = readStored();
    setModeState(stored);
  }, []);

  // Apply mode → data-mode attribute + listen to system if needed.
  useEffect(() => {
    const apply = () => {
      const eff = mode === 'system' ? resolveSystem() : mode;
      setEffectiveMode(eff);
      document.documentElement.setAttribute('data-mode', eff);
    };
    apply();
    if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => apply();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / quota — best-effort persistence */
    }
  }, []);

  return <ModeContext.Provider value={{ mode, effectiveMode, setMode }}>{children}</ModeContext.Provider>;
}

export function useMode(): Ctx {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used inside <ModeProvider>');
  return ctx;
}

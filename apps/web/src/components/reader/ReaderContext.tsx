'use client';

import { createContext, useContext } from 'react';
import type { ReaderThemeKey } from './lib/reader-theme';

export interface ReaderThemeState {
  /** The user's chosen theme key (ignored for the active surface when `auto`). */
  themeKey: ReaderThemeKey;
  /** When true the active theme follows the OS color scheme. */
  auto: boolean;
  /** Screen dimming, 0..1 (1 = full brightness, no overlay). */
  brightness: number;
  /** Warm-light overlay strength, 0..1 (0 = off). */
  warmth: number;
  setTheme: (key: ReaderThemeKey) => void;
  setAuto: (auto: boolean) => void;
  setBrightness: (brightness: number) => void;
  setWarmth: (warmth: number) => void;
}

export const ReaderThemeContext = createContext<ReaderThemeState | null>(null);

export function useReaderTheme(): ReaderThemeState {
  const ctx = useContext(ReaderThemeContext);
  if (!ctx) {
    throw new Error('useReaderTheme must be used within a <ReaderRoot>');
  }
  return ctx;
}

import { describe, it, expect } from 'vitest';
import {
  READER_THEME_KEYS,
  resolveAutoTheme,
  isDarkReaderTheme,
} from '@/components/reader/lib/reader-theme';

describe('reader-theme', () => {
  it('lists the four reader themes', () => {
    expect(READER_THEME_KEYS).toEqual(['paper', 'sepia', 'dark', 'oled']);
  });

  it('auto resolves by OS scheme', () => {
    expect(resolveAutoTheme(true)).toBe('dark');
    expect(resolveAutoTheme(false)).toBe('paper');
  });

  it('knows which themes are dark', () => {
    expect(isDarkReaderTheme('oled')).toBe(true);
    expect(isDarkReaderTheme('paper')).toBe(false);
  });
});

import {
  READER_THEME_KEYS,
  resolveAutoTheme,
  readerPalette,
  type ReaderThemeKey,
} from '@/theme/reader-themes';

describe('reader-themes', () => {
  it('exposes the four reader theme keys in order', () => {
    expect(READER_THEME_KEYS).toEqual(['paper', 'sepia', 'dark', 'oled']);
  });

  it('resolveAutoTheme picks dark when the OS prefers dark, paper otherwise', () => {
    expect(resolveAutoTheme(true)).toBe('dark');
    expect(resolveAutoTheme(false)).toBe('paper');
  });

  it('readerPalette returns the full ten-value palette for every key', () => {
    const fields = [
      'page',
      'ink',
      'inkSoft',
      'faint',
      'chrome',
      'chrome2',
      'line',
      'line2',
      'sel',
      'accent',
    ];
    for (const key of READER_THEME_KEYS) {
      const pal = readerPalette(key, '#abcdef') as unknown as Record<string, string>;
      for (const f of fields) {
        expect(typeof pal[f]).toBe('string');
        expect(pal[f]?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('uses the active app primary as the accent for dark and oled', () => {
    const primary = 'hsl(263 70% 60%)';
    expect(readerPalette('dark', primary).accent).toBe(primary);
    expect(readerPalette('oled', primary).accent).toBe(primary);
  });

  it('uses the active app primary as the accent for paper', () => {
    const primary = 'hsl(38 82% 58%)';
    expect(readerPalette('paper', primary).accent).toBe(primary);
  });

  it('keeps a constant warm accent for sepia regardless of app primary', () => {
    const a = readerPalette('sepia', '#000000').accent;
    const b = readerPalette('sepia', '#ffffff').accent;
    expect(a).toBe(b);
    // The sepia accent is the prototype warm tone, converted from
    // oklch(0.55 0.13 40) to an RN-renderable rgb() literal.
    expect(a).toMatch(/^rgb\(/);
  });

  it('carries the verbatim page colors from reader-themes.css', () => {
    expect(readerPalette('paper', '#000').page).toBe('#faf7f0');
    expect(readerPalette('sepia', '#000').page).toBe('#f3e7cf');
    expect(readerPalette('oled', '#000').page).toBe('#000000');
    expect(readerPalette('dark', '#000').page).toBe('hsl(240 8% 12%)');
  });

  it('exposes ReaderThemeKey as the union of the key list', () => {
    const k: ReaderThemeKey = 'paper';
    expect(READER_THEME_KEYS).toContain(k);
  });
});

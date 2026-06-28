import { tokens, ACCENT_THEMES, COLOR_SCHEMES } from '@/theme/tokens';

describe('theme tokens', () => {
  it('exports all 8 accent themes', () => {
    expect(ACCENT_THEMES).toEqual([
      'tsundoku',
      'foxed',
      'sakura',
      'endpaper',
      'cyanotype',
      'bookworm',
      'galley',
      'sumi',
    ]);
  });

  it('exports both color schemes', () => {
    expect(COLOR_SCHEMES).toEqual(['light', 'dark']);
  });

  it('every (theme, scheme) pair has a tokens object with all keys', () => {
    const keys = [
      'primary',
      'primaryFg',
      'bg',
      'surface',
      'surfaceMuted',
      'border',
      'text',
      'textMuted',
      'manga',
      'comic',
      'novel',
      'ebook',
      'audio',
      'ok',
      'warn',
      'err',
      'info',
    ];
    for (const theme of ACCENT_THEMES) {
      for (const scheme of COLOR_SCHEMES) {
        const t = tokens[theme][scheme];
        for (const k of keys) {
          expect(typeof t[k as keyof typeof t]).toBe('string');
          expect(t[k as keyof typeof t].length).toBeGreaterThan(3);
        }
      }
    }
  });

  it('content-type accents are constant across themes', () => {
    const ref = tokens.tsundoku.dark;
    for (const theme of ACCENT_THEMES) {
      expect(tokens[theme].dark.manga).toBe(ref.manga);
      expect(tokens[theme].dark.comic).toBe(ref.comic);
      expect(tokens[theme].dark.novel).toBe(ref.novel);
      expect(tokens[theme].dark.ebook).toBe(ref.ebook);
      expect(tokens[theme].dark.audio).toBe(ref.audio);
    }
  });

  it('fixed content-type + status accents resolve to RN-renderable rgb, not oklch', () => {
    // RN on iOS renders oklch() color strings as default/black — these tokens
    // are used directly as color/backgroundColor, so they must be rgb().
    const t = tokens.tsundoku.dark;
    for (const k of ['manga', 'comic', 'novel', 'ebook', 'audio', 'ok', 'warn', 'err', 'info'] as const) {
      expect(t[k]).toMatch(/^rgb\(/);
      expect(t[k]).not.toContain('oklch');
    }
  });

  it('galley theme (light accent) uses dark primaryFg in dark scheme', () => {
    expect(tokens.galley.dark.primaryFg).not.toBe('hsl(0 0% 100%)');
  });
});

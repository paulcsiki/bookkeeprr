/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { ACCENT_THEMES, THEME_LABELS, THEME_HUES, type AccentTheme } from '@bookkeeprr/ui';

describe('THEME_LABELS', () => {
  it('maps every accent key to its Japanese display label', () => {
    expect(THEME_LABELS).toEqual({
      violet: 'Tsundoku',
      amber: 'Kohaku',
      rose: 'Sakura',
      teal: 'Asagi',
      sky: 'Sora',
      lime: 'Moegi',
      mono: 'Shiro',
      ink: 'Sumi',
    } satisfies Record<AccentTheme, string>);
  });

  it('keeps every theme key — rename is labels-only', () => {
    expect([...ACCENT_THEMES]).toEqual(['violet', 'amber', 'rose', 'teal', 'sky', 'lime', 'mono', 'ink']);
  });

  it('preserves hue values (no token retune in this phase)', () => {
    expect(THEME_HUES.violet).toBe('hsl(263 70% 60%)');
    expect(THEME_HUES.mono).toBe('hsl(0 0% 90%)');
  });

  it('includes Sumi (ink) as the 8th accent', () => {
    expect(THEME_LABELS.ink).toBe('Sumi');
    expect([...ACCENT_THEMES]).toContain('ink');
    expect(THEME_HUES.ink).toBe('hsl(0 0% 12%)');
  });
});

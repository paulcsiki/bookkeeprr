import { withAlpha, toRgbString, mixSolid } from '@/theme/color';

describe('color resolution (RN cannot render oklch)', () => {
  it('toRgbString converts the oklch status/content tokens to rgb', () => {
    expect(toRgbString('oklch(0.66 0.2 24)')).toBe('rgb(244, 81, 82)'); // err
    expect(toRgbString('oklch(0.8 0.16 75)')).toBe('rgb(249, 173, 38)'); // comic (alt fmt)
    expect(toRgbString('oklch(0.72 0.17 18)')).toBe('rgb(253, 113, 124)'); // manga
  });

  it('toRgbString passes through colors RN already understands', () => {
    expect(toRgbString('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    // Hex resolves to the equivalent rgb() (same color) so withAlpha/mixSolid
    // work on hex accents too (Sumi's primary is '#1f1f25').
    expect(toRgbString('#abcdef')).toBe('rgb(171, 205, 239)');
    expect(toRgbString('#fff')).toBe('rgb(255, 255, 255)');
  });

  it('withAlpha tints rgb() input — so resolved tokens still alpha-blend', () => {
    expect(withAlpha('rgb(244, 81, 82)', 0.13)).toBe('rgba(244, 81, 82, 0.13)');
  });

  it('withAlpha still handles oklch-table, hsl, and hex tokens', () => {
    expect(withAlpha('oklch(0.66 0.2 24)', 0.5)).toBe('rgba(244, 81, 82, 0.5)');
    expect(withAlpha('hsl(0 0% 100%)', 0.2)).toBe('rgba(255, 255, 255, 0.2)');
    expect(withAlpha('#1f1f25', 0.16)).toBe('rgba(31, 31, 37, 0.16)');
  });

  it('mixSolid composes a SOLID blend of fg over bg', () => {
    expect(mixSolid('rgb(255, 255, 255)', 'rgb(0, 0, 0)', 0.5)).toBe('rgb(128, 128, 128)');
    // 16% primary over a dark surface — solid, no alpha channel.
    expect(mixSolid('hsl(0 0% 100%)', 'rgb(20, 20, 28)', 0.16)).toBe('rgb(58, 58, 64)');
  });
});

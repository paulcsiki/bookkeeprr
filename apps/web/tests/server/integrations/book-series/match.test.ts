import { describe, expect, it } from 'vitest';
import { normalizeSeriesName, stripVolumeSuffix, nameMatch } from '@/server/integrations/book-series/match';

describe('normalizeSeriesName', () => {
  it('lowercases and collapses non-alphanumeric', () => {
    expect(normalizeSeriesName('His Dark Materials')).toBe('his dark materials');
    expect(normalizeSeriesName('Mistborn: The Final Empire')).toBe('mistborn the final empire');
  });
});

describe('stripVolumeSuffix', () => {
  it('returns base and null when no volume suffix', () => {
    const r = stripVolumeSuffix('Mistborn: The Final Empire');
    expect(r.position).toBeNull();
    expect(r.base).toBe('Mistborn: The Final Empire');
  });

  it('extracts position 3 from "The Expanse, Vol. 3"', () => {
    const r = stripVolumeSuffix('The Expanse, Vol. 3');
    expect(r.position).toBe(3);
    // base is the title before the vol suffix
    expect(r.base).toContain('Expanse');
  });

  it('extracts position from "Volume 2" suffix', () => {
    const r = stripVolumeSuffix('Wheel of Time Volume 2');
    expect(r.position).toBe(2);
  });

  it('returns null position for ranges', () => {
    const r = stripVolumeSuffix('The Expanse, Vols. 1-3');
    expect(r.position).toBeNull();
  });
});

describe('nameMatch', () => {
  it('matches case-insensitively', () => {
    expect(nameMatch('His Dark Materials', 'his dark materials')).toBe(true);
  });

  it('matches with punctuation differences', () => {
    expect(nameMatch('Mistborn: The Final Empire', 'Mistborn The Final Empire')).toBe(true);
  });

  it('returns false for different names', () => {
    expect(nameMatch('Mistborn', 'Stormlight Archive')).toBe(false);
  });

  it('is symmetric', () => {
    expect(nameMatch('A', 'B')).toBe(nameMatch('B', 'A'));
  });
});

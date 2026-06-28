import { describe, it, expect } from 'vitest';
import {
  fontStack,
  clampTextSettings,
  entryPathFor,
  type TextSettings,
} from '@/components/reader/lib/text-settings';

describe('fontStack', () => {
  it('returns a serif family for serif', () => {
    expect(fontStack('serif')).toMatch(/Georgia|serif/i);
  });
  it('returns a sans family for sans', () => {
    expect(fontStack('sans')).toMatch(/Geist|sans|var\(--font/i);
  });
  it('returns a mono family for mono', () => {
    expect(fontStack('mono')).toMatch(/Mono|mono|var\(--font/i);
  });
  it('returns a dyslexic-friendly family for dys', () => {
    expect(fontStack('dys')).toMatch(/Comic|Trebuchet|OpenDyslexic|Verdana/i);
  });
});

describe('clampTextSettings', () => {
  const base: TextSettings = { fontSize: 18, lineH: 1.6 };

  it('clamps fontSize to the floor of 13', () => {
    expect(clampTextSettings({ ...base, fontSize: 5 }).fontSize).toBe(13);
  });
  it('clamps fontSize to the ceiling of 28', () => {
    expect(clampTextSettings({ ...base, fontSize: 99 }).fontSize).toBe(28);
  });
  it('clamps lineH to the floor of 1.3', () => {
    expect(clampTextSettings({ ...base, lineH: 0.5 }).lineH).toBe(1.3);
  });
  it('clamps lineH to the ceiling of 2.2', () => {
    expect(clampTextSettings({ ...base, lineH: 9 }).lineH).toBe(2.2);
  });
  it('passes through in-range values', () => {
    expect(clampTextSettings({ fontSize: 20, lineH: 1.8 })).toEqual({
      fontSize: 20,
      lineH: 1.8,
    });
  });
});

describe('entryPathFor', () => {
  it('joins opfDir with the spine href', () => {
    expect(entryPathFor('OEBPS', 'ch1.xhtml')).toBe('OEBPS/ch1.xhtml');
  });
  it('returns the bare href when opfDir is empty', () => {
    expect(entryPathFor('', 'ch1.xhtml')).toBe('ch1.xhtml');
  });
  it('returns the bare href when opfDir is undefined', () => {
    expect(entryPathFor(undefined, 'ch1.xhtml')).toBe('ch1.xhtml');
  });
  it('normalizes a nested href', () => {
    expect(entryPathFor('OEBPS', 'text/ch1.xhtml')).toBe('OEBPS/text/ch1.xhtml');
  });
  it('resolves a leading ./', () => {
    expect(entryPathFor('OEBPS', './ch1.xhtml')).toBe('OEBPS/ch1.xhtml');
  });
});

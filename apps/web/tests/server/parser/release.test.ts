import { describe, expect, it } from 'vitest';
import { parseReleaseTitle, refineForSeries } from '@/server/parser/release';
import fixtures from '@/server/parser/__fixtures__/releases.json';

type Fixture = (typeof fixtures)[number];

describe('parseReleaseTitle (fixture-driven)', () => {
  for (const fx of fixtures as Fixture[]) {
    it(fx.title, () => {
      const r = parseReleaseTitle(fx.title);
      expect(r.targetKind).toBe(fx.expected.targetKind);
      expect(r.targetLow).toBe(fx.expected.targetLow);
      expect(r.targetHigh).toBe(fx.expected.targetHigh);
      expect(r.group).toBe(fx.expected.group);
      expect(r.language).toBe(fx.expected.language);
      expect(r.isBatch).toBe(fx.expected.isBatch);
    });
  }

  it('returns a non-empty cleanTitle for typical inputs', () => {
    const r = parseReleaseTitle('[Group] Chainsaw Man - v01 (2024) (Digital)');
    expect(r.cleanTitle.toLowerCase()).toContain('chainsaw');
    expect(r.cleanTitle).not.toContain('[Group]');
    expect(r.cleanTitle).not.toContain('(2024)');
    expect(r.cleanTitle).not.toContain('(Digital)');
  });

  it('confidence is 0..1', () => {
    for (const fx of fixtures as Fixture[]) {
      const r = parseReleaseTitle(fx.title);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('parseReleaseTitle — contentTypeHint', () => {
  it('returns contentTypeHint "comic" for a title containing "manga"', () => {
    const r = parseReleaseTitle('[Unpaid Ferryman] Solo Leveling v01-11 (manga)');
    expect(r.contentTypeHint).toBe('comic');
  });

  it('returns contentTypeHint "comic" for a title containing "manhwa"', () => {
    const r = parseReleaseTitle('[Group] Some Series manhwa v01-05');
    expect(r.contentTypeHint).toBe('comic');
  });

  it('returns contentTypeHint "comic" for a title containing "manhua"', () => {
    const r = parseReleaseTitle('Great Manhua v01');
    expect(r.contentTypeHint).toBe('comic');
  });

  it('returns contentTypeHint "comic" for a title containing "comic"', () => {
    const r = parseReleaseTitle('Batman comic v01 (2022)');
    expect(r.contentTypeHint).toBe('comic');
  });

  it('returns contentTypeHint "prose" for a title containing "novel"', () => {
    const r = parseReleaseTitle('Solo Leveling (novel) v01-07');
    expect(r.contentTypeHint).toBe('prose');
  });

  it('returns contentTypeHint "prose" for a title containing "light novel"', () => {
    const r = parseReleaseTitle('Overlord (Light Novel) v01-17');
    expect(r.contentTypeHint).toBe('prose');
  });

  it('returns contentTypeHint "prose" for a title containing "ln"', () => {
    const r = parseReleaseTitle('Re:Zero LN v01');
    expect(r.contentTypeHint).toBe('prose');
  });

  it('returns contentTypeHint "prose" for a title containing "web novel"', () => {
    const r = parseReleaseTitle('HWFWM (Web Novel)');
    expect(r.contentTypeHint).toBe('prose');
  });

  it('returns contentTypeHint null for a plain title with no type hint', () => {
    const r = parseReleaseTitle('[Unpaid Ferryman] Solo Leveling v01-11');
    expect(r.contentTypeHint).toBeNull();
  });

  it('prefers "comic" over "prose" when both keywords appear', () => {
    const r = parseReleaseTitle('Manga Novel v01');
    expect(r.contentTypeHint).toBe('comic');
  });

  it('returns contentTypeHint "audio" for a title containing "Audiobook"', () => {
    const r = parseReleaseTitle('Atomic Habits James Clear 2018 (miok) [Audiobook] (Self Help)');
    expect(r.contentTypeHint).toBe('audio');
  });

  it('returns contentTypeHint "audio" for an .m4b release', () => {
    const r = parseReleaseTitle('Atomic Habits - James Clear (Unabridged) m4b');
    expect(r.contentTypeHint).toBe('audio');
  });

  it('returns contentTypeHint "prose" for an EPUB ebook release', () => {
    const r = parseReleaseTitle('Atomic Habits by James Clear EPUB');
    expect(r.contentTypeHint).toBe('prose');
  });

  it('prefers "audio" over "prose" for an audiobook of a novel', () => {
    const r = parseReleaseTitle('Solo Leveling (Novel) Audiobook v01');
    expect(r.contentTypeHint).toBe('audio');
  });

  it('refineForSeries preserves contentTypeHint via spread', () => {
    const parsed = parseReleaseTitle('Solo Leveling (manga)');
    expect(parsed.contentTypeHint).toBe('comic');
    const refined = refineForSeries(parsed, { granularity: 'volume', totalVolumes: 7 });
    expect(refined.contentTypeHint).toBe('comic');
  });
});

describe('refineForSeries', () => {
  it('relabels a unit-less title-only pack as a volume batch for a volume series', () => {
    const parsed = parseReleaseTitle('Solo Leveling (Novel) [Yen Press] [LuCaZ]');
    expect(parsed.debug.matched).toBeNull();
    const refined = refineForSeries(parsed, { granularity: 'volume', totalVolumes: null });
    expect(refined.targetKind).toBe('batch');
    expect(refined.isBatch).toBe(true);
    expect(refined.targetLow).toBeNull();
    expect(refined.targetHigh).toBeNull();
  });

  it('assigns a synthetic 1..N range when totalVolumes is known', () => {
    const parsed = parseReleaseTitle('Solo Leveling (Novel) [Yen Press]');
    const refined = refineForSeries(parsed, { granularity: 'volume', totalVolumes: 8 });
    expect(refined.targetKind).toBe('batch');
    expect(refined.targetLow).toBe(1);
    expect(refined.targetHigh).toBe(8);
  });

  it('leaves a unit-less fallback as-is for a chapter series', () => {
    const parsed = parseReleaseTitle('Solo Leveling (Novel) [Yen Press]');
    const refined = refineForSeries(parsed, { granularity: 'chapter', totalVolumes: null });
    expect(refined.targetKind).toBe('chapter');
    expect(refined.isBatch).toBe(false);
  });

  it('never touches a concretely parsed unit', () => {
    const parsed = parseReleaseTitle('[Group] Chainsaw Man - v01 (2024)');
    expect(parsed.debug.matched).toBe('vol-single');
    const refined = refineForSeries(parsed, { granularity: 'volume', totalVolumes: 12 });
    expect(refined).toEqual(parsed);
  });
});

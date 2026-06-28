import { describe, expect, it } from 'vitest';
import { matchRelease } from '@/server/matcher';
import { DEFAULT_WEIGHTS, type AdultFilter } from '@/server/db/settings/matcher';
import type { ParsedRelease } from '@/server/parser/release';
import type { SeriesRow, QualityProfileRow } from '@/server/db/schema';
import type { IndexerResult } from '@/server/integrations/indexers/types';

function parsed(over: Partial<ParsedRelease> = {}): ParsedRelease {
  return {
    cleanTitle: 'Berserk',
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    group: null,
    language: 'en',
    isBatch: false,
    confidence: 0.95,
    contentTypeHint: null,
    debug: { matched: 'vol-single', stripped: 'Berserk' },
    ...over,
  };
}

function series(over: Partial<SeriesRow> = {}): SeriesRow {
  return {
    id: 1,
    contentType: 'manga',
    titleEnglish: 'Berserk',
    titleRomaji: null,
    titleNative: null,
    granularity: 'volume',
    rootPath: '/tmp',
    qualityProfileId: 1,
    monitoring: 'all',
    status: 'releasing',
    extraSearchTermsJson: null,
    ...over,
  } as unknown as SeriesRow;
}

function profile(over: Partial<QualityProfileRow> = {}): QualityProfileRow {
  return {
    id: 1,
    name: 'default',
    preferCompleteBatches: false,
    preferredGroupsJson: '[]',
    preferredLanguagesJson: '["en"]',
    minSizeMb: null,
    maxSizeMb: null,
    preferOriginals: false,
    ...over,
  } as QualityProfileRow;
}

function raw(over: Partial<IndexerResult> = {}): IndexerResult {
  return {
    guid: '1',
    title: 'Berserk v1',
    link: 'magnet:?xt=foo',
    pubDate: new Date(),
    seeders: 100,
    leechers: 1,
    sizeBytes: 100 * 1024 * 1024,
    infoHash: 'h',
    category: '3_1',
    trusted: false,
    remake: false,
    ...over,
  };
}

describe('matchRelease — opts plumbing', () => {
  it('returns no-match when adult filter blocks the release', () => {
    const adultFilter: AdultFilter = { enabled: true, blockedCategories: ['4_1'] };
    const r = matchRelease(
      { parsed: parsed(), series: series(), profile: profile(), raw: raw({ category: '4_1' }) },
      { adultFilter },
    );
    expect(r.matches).toBe(false);
  });

  it('returns match with score when adult filter does not block', () => {
    const adultFilter: AdultFilter = { enabled: true, blockedCategories: ['4_1'] };
    const r = matchRelease(
      { parsed: parsed(), series: series(), profile: profile(), raw: raw({ category: '3_1' }) },
      { adultFilter },
    );
    expect(r.matches).toBe(true);
  });

  it('propagates overridden weights into the score', () => {
    const base = matchRelease({
      parsed: parsed(),
      series: series(),
      profile: profile(),
      raw: raw({ seeders: 1000 }),
    });
    const doubled = matchRelease(
      { parsed: parsed(), series: series(), profile: profile(), raw: raw({ seeders: 1000 }) },
      { weights: { ...DEFAULT_WEIGHTS, seederMultiplier: 10 } },
    );
    expect(base.matches).toBe(true);
    expect(doubled.matches).toBe(true);
    if (base.matches && doubled.matches) {
      expect(doubled.score).toBeGreaterThan(base.score);
    }
  });

  it('works with no opts argument (back-compat)', () => {
    const r = matchRelease({
      parsed: parsed(),
      series: series(),
      profile: profile(),
      raw: raw(),
    });
    expect(r.matches).toBe(true);
  });

  describe('minimum-seeders floor', () => {
    it('rejects a zero-seeder release with reason "insufficient-seeders" (default floor of 1)', () => {
      const r = matchRelease({
        parsed: parsed(),
        series: series(),
        profile: profile(),
        raw: raw({ seeders: 0 }),
      });
      expect(r.matches).toBe(false);
      if (!r.matches) expect(r.reason).toBe('insufficient-seeders');
    });

    it('accepts a release at exactly the floor', () => {
      const r = matchRelease({
        parsed: parsed(),
        series: series(),
        profile: profile(),
        raw: raw({ seeders: 1 }),
      });
      expect(r.matches).toBe(true);
    });

    it('honours an overridden higher floor', () => {
      const r = matchRelease(
        { parsed: parsed(), series: series(), profile: profile(), raw: raw({ seeders: 3 }) },
        { weights: { ...DEFAULT_WEIGHTS, minSeeders: 5 } },
      );
      expect(r.matches).toBe(false);
      if (!r.matches) expect(r.reason).toBe('insufficient-seeders');
    });

    it('disables the floor when minSeeders is 0 (zero-seeder release still matches)', () => {
      const r = matchRelease(
        { parsed: parsed(), series: series(), profile: profile(), raw: raw({ seeders: 0 }) },
        { weights: { ...DEFAULT_WEIGHTS, minSeeders: 0 } },
      );
      expect(r.matches).toBe(true);
    });
  });
});

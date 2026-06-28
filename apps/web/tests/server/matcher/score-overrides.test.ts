import { describe, expect, it } from 'vitest';
import { scoreRelease } from '@/server/matcher/score';
import { DEFAULT_WEIGHTS, type AdultFilter } from '@/server/db/settings/matcher';
import type { ParsedRelease } from '@/server/parser/release';
import type { QualityProfileRow } from '@/server/db/schema';
import type { IndexerResult } from '@/server/integrations/indexers/types';

function parsed(over: Partial<ParsedRelease> = {}): ParsedRelease {
  return {
    cleanTitle: 'X',
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    group: null,
    language: 'en',
    isBatch: false,
    confidence: 0.95,
    contentTypeHint: null,
    debug: { matched: 'vol-single', stripped: 'X' },
    ...over,
  };
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
    title: 'X',
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

describe('scoreRelease — adult filter', () => {
  it('returns null when filter enabled AND category in blocklist', () => {
    const filter: AdultFilter = { enabled: true, blockedCategories: ['4_1'] };
    const r = scoreRelease(parsed(), profile(), raw({ category: '4_1' }), DEFAULT_WEIGHTS, filter);
    expect(r).toBeNull();
  });

  it('returns a score when filter enabled but category NOT in blocklist', () => {
    const filter: AdultFilter = { enabled: true, blockedCategories: ['4_1'] };
    const r = scoreRelease(parsed(), profile(), raw({ category: '3_1' }), DEFAULT_WEIGHTS, filter);
    expect(r).not.toBeNull();
    expect(typeof r).toBe('number');
  });

  it('returns a score when filter disabled even if category in blocklist', () => {
    const filter: AdultFilter = { enabled: false, blockedCategories: ['4_1'] };
    const r = scoreRelease(parsed(), profile(), raw({ category: '4_1' }), DEFAULT_WEIGHTS, filter);
    expect(r).not.toBeNull();
  });

  it('returns a score when no adultFilter argument is passed (default behaviour)', () => {
    const r = scoreRelease(parsed(), profile(), raw({ category: '4_1' }));
    expect(r).not.toBeNull();
  });
});

describe('scoreRelease — weight overrides', () => {
  it('uses DEFAULT_WEIGHTS when no weights argument passed', () => {
    const r = scoreRelease(parsed(), profile(), raw({ seeders: 1000 }));
    // With seederMultiplier=5 and log10(1001)≈3, contribution ≈ 15.
    // No groups, no batch, no trusted, no remake. So score ≈ 15.
    expect(r).toBeGreaterThanOrEqual(13);
    expect(r).toBeLessThanOrEqual(17);
  });

  it('doubling seederMultiplier doubles that contribution', () => {
    const a = scoreRelease(parsed(), profile(), raw({ seeders: 1000 }));
    const b = scoreRelease(parsed(), profile(), raw({ seeders: 1000 }), {
      ...DEFAULT_WEIGHTS,
      seederMultiplier: 10,
    });
    expect(b).toBeGreaterThan(a!);
    expect(b! / a!).toBeGreaterThan(1.8);
    expect(b! / a!).toBeLessThan(2.2);
  });

  it('zero trustedBonus removes the trusted contribution', () => {
    const base = scoreRelease(parsed(), profile(), raw({ trusted: false }));
    const trusted = scoreRelease(parsed(), profile(), raw({ trusted: true }));
    const trustedZero = scoreRelease(parsed(), profile(), raw({ trusted: true }), {
      ...DEFAULT_WEIGHTS,
      trustedBonus: 0,
    });
    expect(trusted).toBeGreaterThan(base!);
    expect(trustedZero).toEqual(base);
  });

  it('overridden remakePenalty changes the penalty magnitude', () => {
    const baseline = scoreRelease(parsed(), profile(), raw({ seeders: 1000, remake: false }));
    const remakeDefault = scoreRelease(parsed(), profile(), raw({ seeders: 1000, remake: true }));
    const remakeNoPenalty = scoreRelease(
      parsed(),
      profile(),
      raw({ seeders: 1000, remake: true }),
      { ...DEFAULT_WEIGHTS, remakePenalty: 0 },
    );
    expect(remakeDefault).toBeLessThan(baseline!);
    expect(remakeNoPenalty).toEqual(baseline);
  });
});

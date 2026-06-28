import { describe, expect, it } from 'vitest';
import { scoreRelease } from '@/server/matcher/score';
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

describe('scoreRelease — hard filters', () => {
  it('rejects when language not preferred', () => {
    const s = scoreRelease(parsed({ language: 'jp' }), profile(), raw());
    expect(s).toBeNull();
  });
  it('accepts when language is preferred', () => {
    const s = scoreRelease(parsed({ language: 'en' }), profile(), raw());
    expect(s).not.toBeNull();
  });
  it('rejects under min size', () => {
    const s = scoreRelease(
      parsed(),
      profile({ minSizeMb: 200 }),
      raw({ sizeBytes: 50 * 1024 * 1024 }),
    );
    expect(s).toBeNull();
  });
  it('rejects over max size', () => {
    const s = scoreRelease(
      parsed(),
      profile({ maxSizeMb: 50 }),
      raw({ sizeBytes: 200 * 1024 * 1024 }),
    );
    expect(s).toBeNull();
  });
  it('null bounds skip the corresponding check', () => {
    const s = scoreRelease(
      parsed(),
      profile({ minSizeMb: null, maxSizeMb: null }),
      raw({ sizeBytes: 999 }),
    );
    expect(s).not.toBeNull();
  });
  it('null parsed.language is treated as en', () => {
    const s = scoreRelease(
      // @ts-expect-error — exercising defensive path
      parsed({ language: null }),
      profile(),
      raw(),
    );
    expect(s).not.toBeNull();
  });
});

describe('scoreRelease — soft tilt', () => {
  it('top preferredGroup gives +100', () => {
    const baseline = scoreRelease(parsed({ group: null }), profile(), raw({ seeders: 0 })) ?? 0;
    const topGroup =
      scoreRelease(
        parsed({ group: 'Alpha' }),
        profile({ preferredGroupsJson: JSON.stringify(['Alpha', 'Beta']) }),
        raw({ seeders: 0 }),
      ) ?? 0;
    expect(topGroup - baseline).toBe(100);
  });

  it('second preferredGroup gives +90', () => {
    const baseline = scoreRelease(parsed({ group: null }), profile(), raw({ seeders: 0 })) ?? 0;
    const second =
      scoreRelease(
        parsed({ group: 'Beta' }),
        profile({ preferredGroupsJson: JSON.stringify(['Alpha', 'Beta']) }),
        raw({ seeders: 0 }),
      ) ?? 0;
    expect(second - baseline).toBe(90);
  });

  it('batch bonus when prefer + isBatch', () => {
    const noPref =
      scoreRelease(
        parsed({ isBatch: true }),
        profile({ preferCompleteBatches: false }),
        raw({ seeders: 0 }),
      ) ?? 0;
    const withPref =
      scoreRelease(
        parsed({ isBatch: true }),
        profile({ preferCompleteBatches: true }),
        raw({ seeders: 0 }),
      ) ?? 0;
    expect(withPref - noPref).toBe(30);
  });

  it('seeder bonus is log-shaped', () => {
    const lo = scoreRelease(parsed(), profile(), raw({ seeders: 0 })) ?? 0;
    const hi = scoreRelease(parsed(), profile(), raw({ seeders: 1000 })) ?? 0;
    expect(hi - lo).toBeGreaterThan(10);
    expect(hi - lo).toBeLessThan(20);
  });

  it('trusted +10, remake -15', () => {
    const baseline = scoreRelease(parsed(), profile(), raw({ seeders: 9999 })) ?? 0;
    const trusted = scoreRelease(parsed(), profile(), raw({ seeders: 9999, trusted: true })) ?? 0;
    const remake = scoreRelease(parsed(), profile(), raw({ seeders: 9999, remake: true })) ?? 0;
    expect(trusted - baseline).toBe(10);
    expect(remake - baseline).toBe(-15);
  });

  it('floors at 0', () => {
    const s = scoreRelease(
      parsed({ group: 'X' }),
      profile({ preferredGroupsJson: JSON.stringify(['Y']) }),
      raw({ seeders: 0, remake: true }),
    );
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

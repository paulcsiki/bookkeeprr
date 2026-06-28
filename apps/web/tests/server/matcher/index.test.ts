import { describe, expect, it } from 'vitest';
import { matchRelease } from '@/server/matcher';
import type { ParsedRelease } from '@/server/parser/release';
import type { SeriesRow, QualityProfileRow } from '@/server/db/schema';
import type { IndexerResult } from '@/server/integrations/indexers/types';

function makeSeries(over: Partial<SeriesRow>): SeriesRow {
  return {
    id: 1,
    anilistId: 1,
    mangadexId: null,
    titleEnglish: 'Test Series',
    titleRomaji: null,
    titleNative: null,
    status: 'releasing',
    coverUrl: null,
    description: null,
    totalVolumes: null,
    totalChapters: null,
    rootPath: '/x',
    monitoring: 'all',
    granularity: 'volume',
    contentType: 'manga',
    qualityProfileId: 1,
    extraSearchTermsJson: '[]',
    addedAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as SeriesRow;
}

const profile: QualityProfileRow = {
  id: 1,
  name: 'default',
  preferCompleteBatches: false,
  preferredGroupsJson: '[]',
  preferredLanguagesJson: '["en"]',
  minSizeMb: null,
  maxSizeMb: null,
  preferOriginals: false,
} as QualityProfileRow;

const raw: IndexerResult = {
  guid: '1',
  title: 'X',
  link: 'magnet:?xt=foo',
  pubDate: new Date(),
  seeders: 10,
  leechers: 0,
  sizeBytes: 100 * 1024 * 1024,
  infoHash: 'h',
  category: '3_1',
  trusted: false,
  remake: false,
};

const parsedVol: ParsedRelease = {
  cleanTitle: 'Test Series v01',
  targetKind: 'volume',
  targetLow: 1,
  targetHigh: 1,
  group: null,
  language: 'en',
  isBatch: false,
  confidence: 0.95,
  contentTypeHint: null,
  debug: { matched: 'vol-single', stripped: 'Test Series v01' },
};

describe('matchRelease pipeline', () => {
  it('matches a volume release for a volume series with matching title', () => {
    const r = matchRelease({
      parsed: parsedVol,
      series: makeSeries({ granularity: 'volume' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(true);
  });

  it('rejects with reason "rejected" when the release is blacklisted, before any other check', () => {
    const r = matchRelease({
      parsed: parsedVol,
      series: makeSeries({ granularity: 'volume' }),
      profile,
      raw,
      rejectedAt: new Date(),
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('rejected');
  });

  it('still matches when rejectedAt is null/undefined', () => {
    const r = matchRelease({
      parsed: parsedVol,
      series: makeSeries({ granularity: 'volume' }),
      profile,
      raw,
      rejectedAt: null,
    });
    expect(r.matches).toBe(true);
  });

  it('rejects with title-mismatch when tokens are not contained', () => {
    const r = matchRelease({
      parsed: { ...parsedVol, cleanTitle: 'Wholly Unrelated v01' },
      series: makeSeries({ granularity: 'volume' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('title-mismatch');
  });

  it('rejects with granularity-mismatch when chapter release hits a volume series', () => {
    const parsedChapter: ParsedRelease = {
      ...parsedVol,
      targetKind: 'chapter',
      cleanTitle: 'Test Series c01',
    };
    const r = matchRelease({
      parsed: parsedChapter,
      series: makeSeries({ granularity: 'volume' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('granularity-mismatch');
  });

  it('matches a title-only complete pack (no parsed unit) for a volume series', () => {
    // "Solo Leveling (Novel) [Yen Press]" — the parser decodes no unit, so it
    // falls back to targetKind 'chapter' with a null unit. This is a whole-series
    // pack (volume numbers live in the files), not a chapter release, so it must
    // match a volume series rather than be rejected as a granularity mismatch.
    const parsedTitleOnly: ParsedRelease = {
      ...parsedVol,
      targetKind: 'chapter',
      targetLow: null,
      targetHigh: null,
      cleanTitle: 'Test Series',
      confidence: 0.1,
      debug: { matched: null, stripped: 'Test Series' },
    };
    const r = matchRelease({
      parsed: parsedTitleOnly,
      series: makeSeries({ granularity: 'volume' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(true);
  });

  it('batch always matches both granularities', () => {
    const parsedBatch: ParsedRelease = {
      ...parsedVol,
      targetKind: 'batch',
      isBatch: true,
      cleanTitle: 'Test Series v01-10',
    };
    expect(
      matchRelease({
        parsed: parsedBatch,
        series: makeSeries({ granularity: 'volume' }),
        profile,
        raw,
      }).matches,
    ).toBe(true);
    expect(
      matchRelease({
        parsed: parsedBatch,
        series: makeSeries({ granularity: 'chapter' }),
        profile,
        raw,
      }).matches,
    ).toBe(true);
  });

  it('rejects with content-type-mismatch when a comic-hint release targets a light_novel series', () => {
    const parsedComic: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Solo Leveling v01-11',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 11,
      isBatch: true,
      contentTypeHint: 'comic',
      debug: { matched: 'vol-range', stripped: 'Solo Leveling v01-11' },
    };
    const r = matchRelease({
      parsed: parsedComic,
      series: makeSeries({ granularity: 'volume', contentType: 'light_novel', titleEnglish: 'Solo Leveling' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('content-type-mismatch');
  });

  it('rejects an audiobook-hint release against an ebook series', () => {
    const parsedAudio: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Atomic Habits James Clear',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      isBatch: true,
      contentTypeHint: 'audio',
      debug: { matched: 'batch', stripped: 'Atomic Habits James Clear' },
    };
    const r = matchRelease({
      parsed: parsedAudio,
      series: makeSeries({ granularity: 'volume', contentType: 'ebook', titleEnglish: 'Atomic Habits' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('content-type-mismatch');
  });

  it('rejects an ebook (prose) release against an audiobook series', () => {
    const parsedProse: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Atomic Habits James Clear',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      isBatch: true,
      contentTypeHint: 'prose',
      debug: { matched: 'batch', stripped: 'Atomic Habits James Clear' },
    };
    const r = matchRelease({
      parsed: parsedProse,
      series: makeSeries({ granularity: 'volume', contentType: 'audiobook', titleEnglish: 'Atomic Habits' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('content-type-mismatch');
  });

  it('matches an audiobook release against an audiobook series', () => {
    const parsedAudio: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Atomic Habits James Clear',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      isBatch: true,
      contentTypeHint: 'audio',
      debug: { matched: 'batch', stripped: 'Atomic Habits James Clear' },
    };
    const r = matchRelease({
      parsed: parsedAudio,
      series: makeSeries({
        granularity: 'volume',
        contentType: 'audiobook',
        titleEnglish: 'Atomic Habits',
        author: 'James Clear',
      }),
      profile,
      raw,
    });
    expect(r.matches).toBe(true);
  });

  it('rejects an implausibly-large untagged release against an ebook series (likely audiobook)', () => {
    const parsedBig: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Atomic Habits James Clear',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      isBatch: true,
      contentTypeHint: null, // combo pack: no audiobook keyword in the title
      debug: { matched: 'batch', stripped: 'Atomic Habits James Clear' },
    };
    const r = matchRelease({
      parsed: parsedBig,
      series: makeSeries({ granularity: 'volume', contentType: 'ebook', titleEnglish: 'Atomic Habits' }),
      profile,
      raw: { ...raw, sizeBytes: 200 * 1024 * 1024 }, // 200 MiB — audiobook territory
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('content-type-mismatch');
  });

  it('accepts a normal-sized ebook release against an ebook series', () => {
    const parsedSmall: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Atomic Habits James Clear',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      isBatch: true,
      contentTypeHint: null,
      debug: { matched: 'batch', stripped: 'Atomic Habits James Clear' },
    };
    const r = matchRelease({
      parsed: parsedSmall,
      series: makeSeries({ granularity: 'volume', contentType: 'ebook', titleEnglish: 'Atomic Habits' }),
      profile,
      raw: { ...raw, sizeBytes: 6 * 1024 * 1024 }, // 6 MiB epub
    });
    expect(r.matches).toBe(true);
  });

  it('accepts a large release when it is explicitly tagged as an ebook', () => {
    const parsedTagged: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Atomic Habits James Clear',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      isBatch: true,
      contentTypeHint: 'prose', // explicitly an ebook/novel — size guard must not fire
      debug: { matched: 'batch', stripped: 'Atomic Habits James Clear' },
    };
    const r = matchRelease({
      parsed: parsedTagged,
      series: makeSeries({ granularity: 'volume', contentType: 'ebook', titleEnglish: 'Atomic Habits' }),
      profile,
      raw: { ...raw, sizeBytes: 200 * 1024 * 1024 },
    });
    expect(r.matches).toBe(true);
  });

  it('does NOT reject an untagged release (contentTypeHint null) against a light_novel series', () => {
    const parsedUntagged: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Solo Leveling v01-11',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 11,
      isBatch: true,
      contentTypeHint: null,
      debug: { matched: 'vol-range', stripped: 'Solo Leveling v01-11' },
    };
    const r = matchRelease({
      parsed: parsedUntagged,
      series: makeSeries({ granularity: 'volume', contentType: 'light_novel', titleEnglish: 'Solo Leveling' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(true);
  });

  it('allows a prose-hint release against a light_novel series', () => {
    const parsedProse: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Solo Leveling v01-07',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 7,
      isBatch: true,
      contentTypeHint: 'prose',
      debug: { matched: 'vol-range', stripped: 'Solo Leveling v01-07' },
    };
    const r = matchRelease({
      parsed: parsedProse,
      series: makeSeries({ granularity: 'volume', contentType: 'light_novel', titleEnglish: 'Solo Leveling' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(true);
  });

  it('rejects on hard size filter', () => {
    const r = matchRelease({
      parsed: parsedVol,
      series: makeSeries({ granularity: 'volume' }),
      profile: { ...profile, maxSizeMb: 1 },
      raw: { ...raw, sizeBytes: 100 * 1024 * 1024 },
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('size');
  });

  // --- Task 4: symmetric content-type guard ---

  it('rejects a comic-hinted release against an audiobook series (symmetric guard)', () => {
    const parsedComic: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Atomic Habits James Clear',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      isBatch: true,
      contentTypeHint: 'comic',
      debug: { matched: 'batch', stripped: 'Atomic Habits James Clear' },
    };
    const r = matchRelease({
      parsed: parsedComic,
      series: makeSeries({ granularity: 'volume', contentType: 'audiobook', titleEnglish: 'Atomic Habits' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('content-type-mismatch');
  });

  it('rejects an audio-hinted release against an ebook (prose) series (symmetric guard)', () => {
    const parsedAudio: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Atomic Habits James Clear',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      isBatch: true,
      contentTypeHint: 'audio',
      debug: { matched: 'batch', stripped: 'Atomic Habits James Clear' },
    };
    const r = matchRelease({
      parsed: parsedAudio,
      series: makeSeries({ granularity: 'volume', contentType: 'ebook', titleEnglish: 'Atomic Habits' }),
      profile,
      raw,
    });
    expect(r.matches).toBe(false);
    if (!r.matches) expect(r.reason).toBe('content-type-mismatch');
  });

  it('allows an audio-hinted release against an audiobook series (same family)', () => {
    const parsedAudio: ParsedRelease = {
      ...parsedVol,
      cleanTitle: 'Atomic Habits James Clear',
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 1,
      isBatch: true,
      contentTypeHint: 'audio',
      debug: { matched: 'batch', stripped: 'Atomic Habits James Clear' },
    };
    const r = matchRelease({
      parsed: parsedAudio,
      series: makeSeries({
        granularity: 'volume',
        contentType: 'audiobook',
        titleEnglish: 'Atomic Habits',
        author: 'James Clear',
      }),
      profile,
      raw,
    });
    expect(r.matches).toBe(true);
  });
});

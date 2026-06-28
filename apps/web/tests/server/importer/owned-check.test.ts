/**
 * Unit tests for isScanItemAlreadyOwned — the pure decision function that
 * decides whether a scanned item should be excluded from import results because
 * its volume is already owned by an existing library series.
 *
 * These tests exercise the pure function in isolation — no DB needed.
 */
import { describe, it, expect } from 'vitest';
import { isScanItemAlreadyOwned, type ExistingSeriesEntry } from '@/server/importer/owned-check';
import type { ScanItem } from '@/server/importer/import-scan';
import type { SeriesRow } from '@/server/db/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  overrides: Partial<ScanItem> & {
    detectedTitle: string;
    contentType: ScanItem['contentType'];
  },
): ScanItem {
  return {
    path: '/library/test/item',
    files: [],
    sizeBytes: 0,
    ...overrides,
  };
}

function makeSeries(
  overrides: Partial<SeriesRow> & {
    titleEnglish: string;
    contentType: SeriesRow['contentType'];
  },
): SeriesRow {
  return {
    id: 1,
    titleRomaji: null,
    titleNative: null,
    author: null,
    anilistId: null,
    malId: null,
    comicvineId: null,
    publisher: null,
    startYear: null,
    pageCount: null,
    runtimeMinutes: null,
    openlibraryId: null,
    isbn: null,
    asin: null,
    narrator: null,
    mangadexId: null,
    novelUpdatesSlug: null,
    novelUpdatesId: null,
    googleBooksVolumeId: null,
    googleBooksQuery: null,
    coverUrl: null,
    description: null,
    totalVolumes: null,
    totalChapters: null,
    status: 'releasing',
    monitoring: 'all',
    granularity: 'volume',
    rootPath: '/library/manga/test-series',
    qualityProfileId: 1,
    groupId: null,
    addedAt: new Date(0),
    updatedAt: new Date(0),
    extraSearchTermsJson: '[]',
    ...overrides,
  };
}

function makeEntry(s: SeriesRow, ownedVolumeNumbers: number[]): ExistingSeriesEntry {
  return { series: s, ownedVolumes: new Set(ownedVolumeNumbers) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isScanItemAlreadyOwned', () => {
  // (a) item whose volume IS owned by a title-matching series → true (skip)
  it('(a) returns true when the item volume is already owned by a matching series', () => {
    const s = makeSeries({ titleEnglish: 'Solo Leveling', contentType: 'manga' });
    const item = makeItem({ detectedTitle: 'Solo Leveling v01', contentType: 'manga' });
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [1])])).toBe(true);
  });

  // (b) item for a MISSING volume of an existing series → false (keep)
  it('(b) returns false when the volume is missing from an otherwise-matching series', () => {
    const s = makeSeries({ titleEnglish: 'Solo Leveling', contentType: 'manga' });
    const item = makeItem({ detectedTitle: 'Solo Leveling v02', contentType: 'manga' });
    // Only volume 1 is owned — volume 2 is missing → keep
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [1])])).toBe(false);
  });

  // (c) item whose title matches NO existing series → false (keep)
  it('(c) returns false when no existing series matches the item title', () => {
    const s = makeSeries({ titleEnglish: 'Berserk', contentType: 'manga' });
    const item = makeItem({ detectedTitle: 'Solo Leveling v01', contentType: 'manga' });
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [1])])).toBe(false);
  });

  it('(c) returns false when existing list is empty', () => {
    const item = makeItem({ detectedTitle: 'Solo Leveling v01', contentType: 'manga' });
    expect(isScanItemAlreadyOwned(item, [])).toBe(false);
  });

  // (d) title-match robustness: brackets, publisher tags, case differences
  it('(d) matches despite volume-suffix and bracket publisher tags', () => {
    const s = makeSeries({ titleEnglish: 'Solo Leveling', contentType: 'manga' });
    // detectedTitle still contains the raw folder name including [Yen Press] etc.
    const item = makeItem({
      detectedTitle: 'Solo Leveling v01 [Yen Press] [Digital]',
      contentType: 'manga',
    });
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [1])])).toBe(true);
  });

  it('(d) matches when detectedTitle is all lowercase', () => {
    const s = makeSeries({ titleEnglish: 'Solo Leveling', contentType: 'manga' });
    const item = makeItem({ detectedTitle: 'solo leveling v01', contentType: 'manga' });
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [1])])).toBe(true);
  });

  // (e) single-book / no-volume item is treated as volume 1
  it('(e) treats an item with no parseable volume as volume 1 — owned → true', () => {
    const s = makeSeries({ titleEnglish: 'My Standalone Novel', contentType: 'ebook' });
    const item = makeItem({ detectedTitle: 'My Standalone Novel', contentType: 'ebook' });
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [1])])).toBe(true);
  });

  it('(e) treats an item with no parseable volume as volume 1 — not owned → false', () => {
    const s = makeSeries({ titleEnglish: 'My Standalone Novel', contentType: 'ebook' });
    const item = makeItem({ detectedTitle: 'My Standalone Novel', contentType: 'ebook' });
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [])])).toBe(false);
  });

  // Content-type guard: items only match series of the same content type
  it('does not match when content types differ', () => {
    const s = makeSeries({ titleEnglish: 'Solo Leveling', contentType: 'light_novel' });
    const item = makeItem({ detectedTitle: 'Solo Leveling v01', contentType: 'manga' });
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [1])])).toBe(false);
  });

  // Conservative: no matching series → keep
  it('is conservative — no matching series means the item is not skipped', () => {
    const item = makeItem({ detectedTitle: 'Brand New Series v01', contentType: 'manga' });
    const s = makeSeries({ titleEnglish: 'Completely Different Title', contentType: 'manga' });
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [1, 2, 3])])).toBe(false);
  });

  // (g) REGRESSION: a book-type series WITH an author set must still match an
  // import filename that omits the author (filenames carry publisher/group tags
  // only). Solo Leveling (author "Chugong, …", light_novel) was leaking into the
  // import grid because its files are named "Solo Leveling v01 [Yen Press] [LuCaZ]"
  // — no author — and the owned-check borrowed the release matcher's author gate.
  it('(g) matches a book series with an author when the filename omits the author', () => {
    const s = makeSeries({
      titleEnglish: 'Solo Leveling',
      titleRomaji: 'Solo Leveling',
      author: 'Chugong, Jang Sung-Lak, 추공',
      contentType: 'light_novel',
    });
    const owned = makeEntry(s, [1, 2, 3, 4, 5, 6, 7]);
    const v1 = makeItem({
      detectedTitle: 'Solo Leveling v01 [Yen Press] [LuCaZ] {r2}',
      contentType: 'light_novel',
    });
    const v8 = makeItem({
      detectedTitle: 'Solo Leveling v08 [Yen Press] [LuCaZ]',
      contentType: 'light_novel',
    });
    expect(isScanItemAlreadyOwned(v1, [owned])).toBe(true); // owned volume → skip
    expect(isScanItemAlreadyOwned(v8, [owned])).toBe(false); // missing volume → show
  });

  // (h) REGRESSION: ebook ⇄ light_novel share the "books" directory, so the same
  // .epub is scanned under BOTH content types. An ebook-typed scan item must be
  // recognised as owned by a LIGHT_NOVEL library series of the same title+volume
  // (and vice versa) — otherwise the ebook copy leaks into import even though the
  // light_novel copy was correctly skipped. (Solo Leveling v01-07 showed as eBook.)
  it('(h) matches an ebook item against a light_novel series (shared "books" dir)', () => {
    const s = makeSeries({
      titleEnglish: 'Solo Leveling',
      author: 'Chugong, Jang Sung-Lak, 추공',
      contentType: 'light_novel',
    });
    const owned = makeEntry(s, [1, 2, 3, 4, 5, 6, 7]);
    const ebookV1 = makeItem({
      detectedTitle: 'Solo Leveling v01 [Yen Press] [LuCaZ] {r2}',
      contentType: 'ebook',
    });
    const ebookV8 = makeItem({
      detectedTitle: 'Solo Leveling v08 [Yen Press] [LuCaZ]',
      contentType: 'ebook',
    });
    expect(isScanItemAlreadyOwned(ebookV1, [owned])).toBe(true); // owned vol, cross-type → skip
    expect(isScanItemAlreadyOwned(ebookV8, [owned])).toBe(false); // missing vol → show
  });

  // (f) batch items are NEVER hidden even when their targetLow volume is already owned
  it('(f) returns false for a batch item even when its targetLow volume is already owned', () => {
    const s = makeSeries({ titleEnglish: 'Solo Leveling', contentType: 'manga' });
    // "v01-v03" is a batch — volume 1 is owned but v02+v03 may not be → keep
    const item = makeItem({ detectedTitle: 'Solo Leveling v01-v03', contentType: 'manga' });
    expect(isScanItemAlreadyOwned(item, [makeEntry(s, [1])])).toBe(false);
  });
});

import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import type { OpenLibrarySearchHit } from '@/server/integrations/openlibrary';
import type { GoogleBooksSearchHit } from '@/server/integrations/googlebooks/client';

// Hoist mocks before any module imports
vi.mock('@/server/integrations/openlibrary', () => ({
  searchBooks: vi.fn(),
}));
vi.mock('@/server/integrations/googlebooks', () => ({
  searchVolumes: vi.fn(),
}));
vi.mock('@/server/db/settings/googlebooks', () => ({
  googleBooksApiKeySetting: { get: vi.fn().mockResolvedValue('') },
}));

import * as ol from '@/server/integrations/openlibrary';
import * as gb from '@/server/integrations/googlebooks';
import { googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { matchScanItem } from '@/server/importer/match-candidate';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeHit(overrides: Partial<OpenLibrarySearchHit> & { olid: string; title: string }): OpenLibrarySearchHit {
  return {
    author: null,
    firstPublishYear: null,
    isbn: null,
    coverUrl: null,
    ...overrides,
  };
}

function makeGbHit(overrides: Partial<GoogleBooksSearchHit> & { gbid: string; title: string }): GoogleBooksSearchHit {
  return {
    author: null,
    year: null,
    isbn: null,
    coverUrl: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it('ranks the title-leading book first', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL1W', title: 'Northern Lights', author: 'Philip Pullman', firstPublishYear: 1995, coverUrl: 'https://covers.openlibrary.org/nl.jpg' }),
    makeHit({ olid: 'OL2W', title: 'Science of His Dark Materials', author: 'Mary Gribbin', firstPublishYear: 2003 }),
  ]);

  const r = await matchScanItem({
    path: '/b/Northern Lights.epub',
    detectedTitle: 'Northern Lights',
    contentType: 'ebook',
    files: ['/b/Northern Lights.epub'],
    sizeBytes: 1,
  });

  expect(r.best?.title).toBe('Northern Lights');
  expect(r.best?.sourceId).toBe('OL1W');
  expect(r.alternatives.length).toBeGreaterThan(0);
  // The noise entry should be in alternatives (or absent), not best
  expect(r.alternatives.some((c) => c.title === 'Science of His Dark Materials')).toBe(true);
});

it('returns best:null and empty alternatives when provider throws', async () => {
  vi.mocked(ol.searchBooks).mockRejectedValue(new Error('network error'));

  const r = await matchScanItem({
    path: '/b/Northern Lights.epub',
    detectedTitle: 'Northern Lights',
    contentType: 'ebook',
    files: ['/b/Northern Lights.epub'],
    sizeBytes: 1,
  });

  expect(r.best).toBeNull();
  expect(r.alternatives).toEqual([]);
});

it('returns best:null when provider returns empty array', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([]);

  const r = await matchScanItem({
    path: '/b/Unknown Book.epub',
    detectedTitle: 'Unknown Book',
    contentType: 'ebook',
    files: ['/b/Unknown Book.epub'],
    sizeBytes: 1,
  });

  expect(r.best).toBeNull();
  expect(r.alternatives).toEqual([]);
});

it('preserves ScanItem fields on the returned MatchedItem', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL1W', title: 'Northern Lights', author: 'Philip Pullman', firstPublishYear: 1995 }),
  ]);

  const item = {
    path: '/b/Northern Lights.epub',
    detectedTitle: 'Northern Lights',
    contentType: 'ebook' as const,
    files: ['/b/Northern Lights.epub'],
    sizeBytes: 12345,
  };
  const r = await matchScanItem(item);

  expect(r.path).toBe(item.path);
  expect(r.detectedTitle).toBe(item.detectedTitle);
  expect(r.contentType).toBe(item.contentType);
  expect(r.sizeBytes).toBe(item.sizeBytes);
});

it('maps OL hits to Candidate shape with source=openlibrary', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL42W', title: 'Atomic Habits', author: 'James Clear', firstPublishYear: 2018, isbn: '9780735211292', coverUrl: 'https://example.com/cover.jpg' }),
  ]);

  const r = await matchScanItem({
    path: '/b/Atomic Habits.epub',
    detectedTitle: 'Atomic Habits',
    contentType: 'ebook',
    files: ['/b/Atomic Habits.epub'],
    sizeBytes: 1,
  });

  expect(r.best?.source).toBe('openlibrary');
  expect(r.best?.sourceId).toBe('OL42W');
  expect(r.best?.isbn).toBe('9780735211292');
});

it('alternatives are capped at 4', async () => {
  const hits: OpenLibrarySearchHit[] = Array.from({ length: 10 }, (_, i) =>
    makeHit({ olid: `OL${i}W`, title: i === 0 ? 'Dune' : `Dune noise ${i}`, author: 'Frank Herbert', firstPublishYear: 1965 + i }),
  );
  vi.mocked(ol.searchBooks).mockResolvedValue(hits);

  const r = await matchScanItem({
    path: '/b/Dune.epub',
    detectedTitle: 'Dune',
    contentType: 'ebook',
    files: ['/b/Dune.epub'],
    sizeBytes: 1,
  });

  expect(r.best).not.toBeNull();
  expect(r.alternatives.length).toBeLessThanOrEqual(4);
});

// ---------------------------------------------------------------------------
// Google Books code path (I1)
// ---------------------------------------------------------------------------

it('deduplicates GB hit that matches OL title+author — OL entry kept; GB cover grafted when OL cover is null', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL1W', title: 'Atomic Habits', author: 'James Clear', firstPublishYear: 2018, coverUrl: null }),
  ]);
  vi.mocked(googleBooksApiKeySetting.get).mockResolvedValue('fake-api-key');
  vi.mocked(gb.searchVolumes).mockResolvedValue([
    makeGbHit({ gbid: 'GB1', title: 'Atomic Habits', author: 'James Clear', year: 2018, coverUrl: 'https://books.google.com/cover.jpg' }),
  ]);

  const r = await matchScanItem({
    path: '/b/Atomic Habits.epub',
    detectedTitle: 'Atomic Habits',
    contentType: 'ebook',
    files: ['/b/Atomic Habits.epub'],
    sizeBytes: 1,
  });

  // Exactly 1 candidate after dedup — OL wins
  const all = [r.best, ...r.alternatives].filter(Boolean);
  expect(all.length).toBe(1);
  expect(r.best?.source).toBe('openlibrary');
  expect(r.best?.sourceId).toBe('OL1W');
  // GB cover was grafted onto the OL entry
  expect(r.best?.coverUrl).toBe('https://books.google.com/cover.jpg');
});

it('returns GB hit as best when OL throws', async () => {
  vi.mocked(ol.searchBooks).mockRejectedValue(new Error('OL network error'));
  vi.mocked(googleBooksApiKeySetting.get).mockResolvedValue('fake-api-key');
  vi.mocked(gb.searchVolumes).mockResolvedValue([
    makeGbHit({ gbid: 'GB42', title: 'Dune', author: 'Frank Herbert', year: 1965, isbn: '9780441013593', coverUrl: 'https://books.google.com/dune.jpg' }),
  ]);

  const r = await matchScanItem({
    path: '/b/Dune.epub',
    detectedTitle: 'Dune',
    contentType: 'ebook',
    files: ['/b/Dune.epub'],
    sizeBytes: 1,
  });

  expect(r.best?.source).toBe('googlebooks');
  expect(r.best?.sourceId).toBe('gb:GB42');
  expect(r.best?.title).toBe('Dune');
  expect(r.alternatives).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// M1: dedup key includes author — same title, different authors are both kept
// ---------------------------------------------------------------------------

it('retains both candidates when title matches but authors differ', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL1W', title: 'Foundation', author: 'Isaac Asimov', firstPublishYear: 1951 }),
  ]);
  vi.mocked(googleBooksApiKeySetting.get).mockResolvedValue('fake-api-key');
  vi.mocked(gb.searchVolumes).mockResolvedValue([
    makeGbHit({ gbid: 'GB1', title: 'Foundation', author: 'Another Author', year: 2020 }),
  ]);

  const r = await matchScanItem({
    path: '/b/Foundation.epub',
    detectedTitle: 'Foundation',
    contentType: 'ebook',
    files: ['/b/Foundation.epub'],
    sizeBytes: 1,
  });

  const all = [r.best, ...r.alternatives].filter(Boolean);
  expect(all.length).toBe(2);
  expect(all.some((c) => c?.source === 'openlibrary')).toBe(true);
  expect(all.some((c) => c?.source === 'googlebooks')).toBe(true);
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { adoptImportRows, type AdoptRow } from '@/server/importer/adopt';
import { getSeries } from '@/server/db/series';
import { listLibraryFilesBySeries } from '@/server/db/library-files';
import { listVolumesBySeries } from '@/server/db/volumes';
import { getDb } from '@/server/db/client';
import { series as seriesTable } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('adoptImportRows — ebook', () => {
  it('creates a series + volume 1 + library_file for an untracked ebook file', async () => {
    const row: AdoptRow = {
      item: {
        path: '/books/Sabriel.epub',
        detectedTitle: 'Sabriel',
        contentType: 'ebook',
        files: ['/books/Sabriel.epub'],
        sizeBytes: 1_234_567,
      },
      match: {
        sourceId: 'OL12345W',
        title: 'Sabriel',
        author: 'Garth Nix',
        year: 1995,
        isbn: null,
        coverUrl: null,
        source: 'openlibrary',
      },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    const result = await adoptImportRows([row]);

    expect(result.imported).toBe(1);
    expect(result.seriesIds).toHaveLength(1);

    const seriesId = result.seriesIds[0]!;
    const s = await getSeries(seriesId);
    expect(s?.titleEnglish).toBe('Sabriel');
    expect(s?.contentType).toBe('ebook');
    expect(s?.openlibraryId).toBe('OL12345W');
    expect(s?.monitoring).toBe('all');

    // Volume 1 must exist
    const vols = await listVolumesBySeries(seriesId);
    expect(vols.some((v) => v.number === 1)).toBe(true);

    // Library file must be recorded
    const files = await listLibraryFilesBySeries(seriesId);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('/books/Sabriel.epub');
    expect(files[0]!.sizeBytes).toBe(1_234_567);
  });

  it('is idempotent — re-running adopts nothing new', async () => {
    const row: AdoptRow = {
      item: {
        path: '/books/Sabriel.epub',
        detectedTitle: 'Sabriel',
        contentType: 'ebook',
        files: ['/books/Sabriel.epub'],
        sizeBytes: 1_234_567,
      },
      match: {
        sourceId: 'OL12345W',
        title: 'Sabriel',
        author: 'Garth Nix',
        year: 1995,
        isbn: null,
        coverUrl: null,
        source: 'openlibrary',
      },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    const first = await adoptImportRows([row]);
    expect(first.imported).toBe(1);
    expect(first.seriesIds).toHaveLength(1);

    const second = await adoptImportRows([row]);
    expect(second.imported).toBe(0);
    expect(second.seriesIds).toHaveLength(1);
    expect(second.seriesIds[0]).toBe(first.seriesIds[0]);

    // Still exactly one library_file
    const files = await listLibraryFilesBySeries(first.seriesIds[0]!);
    expect(files).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('adoptImportRows — light_novel', () => {
  it('creates a series + volume 1 + library_file for an untracked light novel file', async () => {
    const row: AdoptRow = {
      item: {
        path: '/books/Overlord.epub',
        detectedTitle: 'Overlord',
        contentType: 'light_novel',
        files: ['/books/Overlord.epub'],
        sizeBytes: 2_000_000,
      },
      match: {
        sourceId: 'gb-abc123',
        title: 'Overlord',
        author: 'Kugane Maruyama',
        year: 2012,
        isbn: null,
        coverUrl: null,
        source: 'googlebooks',
      },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    const result = await adoptImportRows([row]);

    expect(result.imported).toBe(1);
    expect(result.seriesIds).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    const seriesId = result.seriesIds[0]!;
    const s = await getSeries(seriesId);
    expect(s?.titleEnglish).toBe('Overlord');
    expect(s?.contentType).toBe('light_novel');
    expect(s?.googleBooksVolumeId).toBe('gb-abc123');
    expect(s?.monitoring).toBe('all');

    // Volume 1 must exist
    const vols = await listVolumesBySeries(seriesId);
    expect(vols.some((v) => v.number === 1)).toBe(true);

    // Library file must be recorded
    const files = await listLibraryFilesBySeries(seriesId);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('/books/Overlord.epub');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('adoptImportRows — per-row error resilience', () => {
  it('skips a manga row (unsupported) without aborting the batch; valid rows still adopt', async () => {
    const mangaRow: AdoptRow = {
      item: {
        path: '/manga/Berserk',
        detectedTitle: 'Berserk',
        contentType: 'manga',
        files: ['/manga/Berserk/vol1.cbz'],
        sizeBytes: 50_000_000,
      },
      match: {
        sourceId: 'OL_MANGA_1',
        title: 'Berserk',
        author: 'Kentaro Miura',
        year: 1989,
        isbn: null,
        coverUrl: null,
        source: 'openlibrary',
      },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    const ebookRow: AdoptRow = {
      item: {
        path: '/books/Dune.epub',
        detectedTitle: 'Dune',
        contentType: 'ebook',
        files: ['/books/Dune.epub'],
        sizeBytes: 3_000_000,
      },
      match: {
        sourceId: 'OL99W',
        title: 'Dune',
        author: 'Frank Herbert',
        year: 1965,
        isbn: null,
        coverUrl: null,
        source: 'openlibrary',
      },
      monitor: false,
      qualityProfileId: h.qpId,
    };

    // Must NOT throw
    const result = await adoptImportRows([mangaRow, ebookRow]);

    // manga row is skipped
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.path).toBe('/manga/Berserk');
    expect(result.skipped[0]!.reason).toMatch(/unsupported/i);

    // ebook row still adopts
    expect(result.imported).toBe(1);
    expect(result.seriesIds).toHaveLength(1);

    const seriesId = result.seriesIds[0]!;
    const dbRow = await getDb()
      .select({ contentType: seriesTable.contentType })
      .from(seriesTable)
      .where(eq(seriesTable.id, seriesId))
      .limit(1);
    expect(dbRow[0]?.contentType).toBe('ebook');

    // manga series must NOT have been created
    const allSeries = await getDb().select().from(seriesTable);
    expect(allSeries.every((s) => s.contentType !== 'manga')).toBe(true);
  });
});

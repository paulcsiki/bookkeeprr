import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { ebookHydrateDescriptor } from '@/server/jobs/kinds/ebook-hydrate';
import { insertSeries, getSeries } from '@/server/db/series';
import { listVolumesBySeries } from '@/server/db/volumes';
import * as googleBooks from '@/server/integrations/googlebooks';
import * as openlibrary from '@/server/integrations/openlibrary';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  // Network guard: no ebook_hydrate test should reach the real OpenLibrary /
  // Google Books APIs (they make the suite slow + flaky and, with the OL retry
  // policy, can multiply a single hung request). Default every external call to
  // a safe empty result; tests that exercise a specific source re-spy with their
  // own resolved value, which overrides these.
  vi.spyOn(openlibrary, 'getWork').mockResolvedValue(null);
  vi.spyOn(openlibrary, 'getWorkEdition').mockResolvedValue({ isbn: null, pages: null });
  vi.spyOn(openlibrary, 'getEditionByIsbn').mockResolvedValue(null);
  vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue(null);
  vi.spyOn(googleBooks, 'getVolume').mockResolvedValue(null);
});
afterEach(() => {
  h.cleanup();
  vi.restoreAllMocks();
});

async function makeEbook(opts: {
  isbn?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  totalVolumes?: number | null;
  contentType?: 'ebook' | 'manga';
  pageCount?: number | null;
}): Promise<number> {
  const id = await insertSeries({
    contentType: opts.contentType ?? 'ebook',
    openlibraryId: 'OL123M',
    isbn: opts.isbn ?? null,
    titleEnglish: 'Test Ebook',
    status: 'finished',
    rootPath: '/media/books/Author/Test Ebook',
    qualityProfileId: h.qpId,
    coverUrl: opts.coverUrl ?? null,
    description: opts.description ?? null,
    totalVolumes: opts.totalVolumes ?? 1,
    pageCount: opts.pageCount ?? null,
    granularity: 'volume',
    monitoring: 'future',
  });
  return id;
}

describe('ebook_hydrate', () => {
  it('fills description + cover from Google Books when null', async () => {
    const id = await makeEbook({ isbn: '9781234567890', description: null, coverUrl: null });
    const spy = vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: 'A gripping tale.',
      pageCount: 320,
      coverUrl: 'https://books.example/cover.jpg',
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(spy).toHaveBeenCalledWith('9781234567890', null);
    expect(result.fieldsUpdated).toContain('description');
    expect(result.fieldsUpdated).toContain('coverUrl');
    expect(result.fieldsUpdated).toContain('pageCount');

    const updated = await getSeries(id);
    expect(updated!.description).toBe('A gripping tale.');
    expect(updated!.coverUrl).toBe('https://books.example/cover.jpg');
    expect(updated!.pageCount).toBe(320);
  });

  it('does not overwrite an existing pageCount', async () => {
    const id = await makeEbook({
      isbn: '9781234567890',
      // description/cover already set so the only reason to hit Google Books is
      // a missing pageCount; here pageCount is already set, so no lookup at all.
      description: 'User-set synopsis',
      coverUrl: 'https://discover.example/cover.jpg',
      pageCount: 111,
    });
    const spy = vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: 'Google synopsis',
      pageCount: 320,
      coverUrl: 'https://books.example/cover.jpg',
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(spy).not.toHaveBeenCalled();
    expect(result.fieldsUpdated).not.toContain('pageCount');

    const updated = await getSeries(id);
    expect(updated!.pageCount).toBe(111);
  });

  it('fills pageCount when null even if description/cover already set', async () => {
    const id = await makeEbook({
      isbn: '9781234567890',
      description: 'User-set synopsis',
      coverUrl: 'https://discover.example/cover.jpg',
      pageCount: null,
    });
    const spy = vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: 'Google synopsis',
      pageCount: 432,
      coverUrl: 'https://books.example/cover.jpg',
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(spy).toHaveBeenCalledWith('9781234567890', null);
    expect(result.fieldsUpdated).toContain('pageCount');
    expect(result.fieldsUpdated).not.toContain('description');
    expect(result.fieldsUpdated).not.toContain('coverUrl');

    const updated = await getSeries(id);
    expect(updated!.pageCount).toBe(432);
    expect(updated!.description).toBe('User-set synopsis');
  });

  it('does not overwrite an existing description/cover', async () => {
    const id = await makeEbook({
      isbn: '9781234567890',
      description: 'User-set synopsis',
      coverUrl: 'https://discover.example/cover.jpg',
      pageCount: 200,
    });
    const spy = vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: 'Google synopsis',
      pageCount: 320,
      coverUrl: 'https://books.example/cover.jpg',
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    // All three already set → no Google Books lookup needed, no field changes.
    expect(spy).not.toHaveBeenCalled();
    expect(result.fieldsUpdated).not.toContain('description');
    expect(result.fieldsUpdated).not.toContain('coverUrl');

    const updated = await getSeries(id);
    expect(updated!.description).toBe('User-set synopsis');
    expect(updated!.coverUrl).toBe('https://discover.example/cover.jpg');
  });

  it('creates volume 1 for a single ebook', async () => {
    const id = await makeEbook({ isbn: null, totalVolumes: 1 });
    const ol = await import('@/server/integrations/openlibrary');
    vi.spyOn(ol, 'getWorkEdition').mockResolvedValue({ isbn: null, pages: null });
    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(result.volumesAdded).toBe(1);
    const vols = await listVolumesBySeries(id);
    expect(vols).toHaveLength(1);
    expect(vols[0]!.number).toBe(1);
    expect(vols[0]!.title).toBe('Volume 1');
  });

  it('is idempotent on a second run', async () => {
    const id = await makeEbook({ isbn: '9781234567890', description: null, coverUrl: null });
    vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: 'A gripping tale.',
      pageCount: 320,
      coverUrl: 'https://books.example/cover.jpg',
    });

    await ebookHydrateDescriptor.handler({ seriesId: id }, 1);
    const second = await ebookHydrateDescriptor.handler({ seriesId: id }, 2);

    expect(second.fieldsUpdated).toEqual([]);
    expect(second.volumesAdded).toBe(0);
    const vols = await listVolumesBySeries(id);
    expect(vols).toHaveLength(1);
  });

  it('no-ops for non-ebook content type', async () => {
    const id = await makeEbook({ isbn: '9781234567890', contentType: 'manga' });
    const spy = vi.spyOn(googleBooks, 'lookupByIsbn');

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(spy).not.toHaveBeenCalled();
    expect(result.fieldsUpdated).toEqual([]);
    expect(result.volumesAdded).toBe(0);
    const vols = await listVolumesBySeries(id);
    expect(vols).toHaveLength(0);
  });

  it('resolves a missing ISBN from OpenLibrary editions, then fills pageCount + description', async () => {
    const id = await makeEbook({ isbn: null, description: null, coverUrl: 'x', pageCount: null });
    const ol = await import('@/server/integrations/openlibrary');
    const editionSpy = vi.spyOn(ol, 'getWorkEdition').mockResolvedValue({ isbn: '9780593135204', pages: null });
    const gbSpy = vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: 'Resolved synopsis',
      pageCount: 320,
      coverUrl: 'https://books.example/cover.jpg',
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(editionSpy).toHaveBeenCalledWith('OL123M');
    expect(gbSpy).toHaveBeenCalledWith('9780593135204', null);
    expect(result.fieldsUpdated).toContain('isbn');
    expect(result.fieldsUpdated).toContain('pageCount');
    expect(result.fieldsUpdated).toContain('description');

    const updated = await getSeries(id);
    expect(updated!.isbn).toBe('9780593135204');
    expect(updated!.pageCount).toBe(320);
    expect(updated!.description).toBe('Resolved synopsis');
    expect(updated!.coverUrl).toBe('x'); // pre-existing, never overwritten
  });

  it('fills pageCount from OpenLibrary when Google Books has none', async () => {
    const id = await makeEbook({ isbn: null, description: null, coverUrl: 'x', pageCount: null });
    const ol = await import('@/server/integrations/openlibrary');
    vi.spyOn(ol, 'getWorkEdition').mockResolvedValue({ isbn: '9780593135204', pages: 336 });
    // Google Books has no page count for this niche ISBN.
    vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: 'Resolved synopsis',
      pageCount: null,
      coverUrl: null,
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(result.fieldsUpdated).toContain('pageCount');
    const updated = await getSeries(id);
    expect(updated!.pageCount).toBe(336); // from OpenLibrary, not Google Books
  });

  it('does not resolve an ISBN when one is already stored', async () => {
    // pageCount set too, so nothing needs the editions lookup at all.
    const id = await makeEbook({
      isbn: '9781234567890',
      description: null,
      coverUrl: null,
      pageCount: 200,
    });
    const ol = await import('@/server/integrations/openlibrary');
    const editionSpy = vi.spyOn(ol, 'getWorkEdition');
    vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: 'A gripping tale.',
      pageCount: 320,
      coverUrl: 'https://books.example/cover.jpg',
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(editionSpy).not.toHaveBeenCalled();
    expect(result.fieldsUpdated).not.toContain('isbn');
  });

  it('is idempotent after resolving an ISBN from editions', async () => {
    const id = await makeEbook({ isbn: null, description: null, coverUrl: null, pageCount: null });
    const ol = await import('@/server/integrations/openlibrary');
    vi.spyOn(ol, 'getWorkEdition').mockResolvedValue({ isbn: '9780593135204', pages: null });
    vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: 'Resolved synopsis',
      pageCount: 320,
      coverUrl: 'https://books.example/cover.jpg',
    });

    await ebookHydrateDescriptor.handler({ seriesId: id }, 1);
    const second = await ebookHydrateDescriptor.handler({ seriesId: id }, 2);

    expect(second.fieldsUpdated).toEqual([]);
    expect(second.volumesAdded).toBe(0);
  });

  it('falls back to OpenLibrary work description when Google Books has none', async () => {
    const id = await makeEbook({ isbn: '9781234567890', description: null, coverUrl: 'x' });
    vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: null,
      pageCount: null,
      coverUrl: null,
    });
    const ol = await import('@/server/integrations/openlibrary');
    vi.spyOn(ol, 'getWork').mockResolvedValue({
      key: '/works/OL999W',
      title: 'Test Ebook',
      description: { value: 'OL synopsis' },
      alternateTitles: [],
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(result.fieldsUpdated).toContain('description');
    const updated = await getSeries(id);
    expect(updated!.description).toBe('OL synopsis');
  });

  it('merges OL alternate titles into extraSearchTermsJson and enqueues a search', async () => {
    const id = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OL28988W',
      titleEnglish: 'Northern Lights',
      status: 'finished',
      rootPath: '/media/books/Pullman/Northern Lights',
      qualityProfileId: h.qpId,
      coverUrl: 'https://example.com/cover.jpg',
      description: 'An existing description',
      totalVolumes: 1,
      pageCount: 300,
      granularity: 'volume',
      monitoring: 'future',
    });
    vi.spyOn(openlibrary, 'getWork').mockResolvedValue({
      key: '/works/OL28988W',
      title: 'Northern Lights',
      alternate_titles: ['The Golden Compass'],
      alternateTitles: ['The Golden Compass'],
    });

    await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    const s = await getSeries(id);
    expect(JSON.parse(s!.extraSearchTermsJson)).toContain('The Golden Compass');
  });

  it('excludes the primary title from extraSearchTermsJson aliases (case-insensitive)', async () => {
    const id = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OL28988W',
      titleEnglish: 'Northern Lights',
      status: 'finished',
      rootPath: '/media/books/Pullman/Northern Lights',
      qualityProfileId: h.qpId,
      coverUrl: 'https://example.com/cover.jpg',
      description: 'An existing description',
      totalVolumes: 1,
      pageCount: 300,
      granularity: 'volume',
      monitoring: 'future',
    });
    vi.spyOn(openlibrary, 'getWork').mockResolvedValue({
      key: '/works/OL28988W',
      title: 'Northern Lights',
      alternate_titles: ['northern lights', 'The Golden Compass'],
      alternateTitles: ['northern lights', 'The Golden Compass'],
    });

    await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    const s = await getSeries(id);
    const terms: string[] = JSON.parse(s!.extraSearchTermsJson);
    expect(terms).toContain('The Golden Compass');
    expect(terms).not.toContain('northern lights');
  });

  it('is idempotent when alternate titles are merged twice', async () => {
    const id = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OL28988W',
      titleEnglish: 'Northern Lights',
      status: 'finished',
      rootPath: '/media/books/Pullman/Northern Lights',
      qualityProfileId: h.qpId,
      coverUrl: 'https://example.com/cover.jpg',
      description: 'An existing description',
      totalVolumes: 1,
      pageCount: 300,
      granularity: 'volume',
      monitoring: 'future',
    });
    vi.spyOn(openlibrary, 'getWork').mockResolvedValue({
      key: '/works/OL28988W',
      title: 'Northern Lights',
      alternate_titles: ['The Golden Compass'],
      alternateTitles: ['The Golden Compass'],
    });

    await ebookHydrateDescriptor.handler({ seriesId: id }, 1);
    await ebookHydrateDescriptor.handler({ seriesId: id }, 2);

    const s = await getSeries(id);
    const terms: string[] = JSON.parse(s!.extraSearchTermsJson);
    expect(terms.filter((t) => t === 'The Golden Compass')).toHaveLength(1);
  });
});

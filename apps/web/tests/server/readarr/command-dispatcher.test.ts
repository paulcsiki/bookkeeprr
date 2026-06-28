import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries } from '@/server/db/series';
import { dispatchReadarrCommand } from '@/server/readarr/command-dispatcher';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('dispatchReadarrCommand', () => {
  it('RefreshAuthor enqueues metadata_hydrate for ebook series', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLa',
      status: 'releasing',
      rootPath: '/media/books/A',
      qualityProfileId: h.qpId,
      titleEnglish: 'A',
    });
    const result = await dispatchReadarrCommand('RefreshAuthor', { authorId: sid });
    expect(result.kind).toBe('enqueued');
    if (result.kind === 'enqueued') {
      expect(result.jobKind).toBe('metadata_hydrate');
      expect(result.jobId).toBeGreaterThan(0);
    }
  });

  it('RefreshAuthor enqueues comicvine_hydrate for comic series', async () => {
    const sid = await insertSeries({
      contentType: 'comic',
      comicvineId: 42,
      status: 'releasing',
      rootPath: '/media/comics/A',
      qualityProfileId: h.qpId,
      titleEnglish: 'A',
    });
    const result = await dispatchReadarrCommand('RefreshAuthor', { authorId: sid });
    expect(result.kind).toBe('enqueued');
    if (result.kind === 'enqueued') expect(result.jobKind).toBe('comicvine_hydrate');
  });

  it('AuthorSearch enqueues missing_search', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLb',
      status: 'releasing',
      rootPath: '/media/books/B',
      qualityProfileId: h.qpId,
      titleEnglish: 'B',
    });
    const result = await dispatchReadarrCommand('AuthorSearch', { authorId: sid });
    expect(result.kind).toBe('enqueued');
    if (result.kind === 'enqueued') expect(result.jobKind).toBe('missing_search');
  });

  it('BookSearch enqueues missing_search (series-scoped)', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLc',
      status: 'releasing',
      rootPath: '/media/books/C',
      qualityProfileId: h.qpId,
      titleEnglish: 'C',
    });
    const result = await dispatchReadarrCommand('BookSearch', { authorId: sid });
    expect(result.kind).toBe('enqueued');
    if (result.kind === 'enqueued') expect(result.jobKind).toBe('missing_search');
  });

  it('RescanFolders enqueues library_scan', async () => {
    const result = await dispatchReadarrCommand('RescanFolders', {});
    expect(result.kind).toBe('enqueued');
    if (result.kind === 'enqueued') expect(result.jobKind).toBe('library_scan');
  });

  it('RefreshAuthor with unknown authorId is a no-op', async () => {
    const result = await dispatchReadarrCommand('RefreshAuthor', { authorId: 99999 });
    expect(result.kind).toBe('noop');
  });

  it('RefreshAuthor with no authorId is a no-op', async () => {
    const result = await dispatchReadarrCommand('RefreshAuthor', {});
    expect(result.kind).toBe('noop');
  });

  it('Unknown command name is a no-op', async () => {
    const result = await dispatchReadarrCommand('NoSuchThing', {});
    expect(result.kind).toBe('noop');
  });
});

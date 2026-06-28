import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import {
  ReadarrAuthor,
  ReadarrBook,
  ReadarrErrorResponse,
} from '@/server/openapi/schemas/readarr';
import { insertSeries, getSeries } from '@/server/db/series';
import { DELETE as authorDelete, PUT as authorPut } from '@/app/api/readarr/v1/author/[id]/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('DELETE /api/readarr/v1/author/{id}', () => {
  it('deletes the series and returns 204', async () => {
    const id = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLdel',
      status: 'releasing',
      rootPath: '/media/books/D',
      qualityProfileId: h.qpId,
      titleEnglish: 'D',
    });
    const r = await authorDelete(new Request('http://x'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(r.status).toBe(204);
    const after = await getSeries(id);
    expect(after).toBeNull();
  });

  it('returns 404 for unknown id', async () => {
    const r = await authorDelete(new Request('http://x'), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(r.status).toBe(404);
    await expectShape(ReadarrErrorResponse, r, 'DELETE /api/readarr/v1/author/{id} 404');
  });

  it('returns 400 for non-numeric id', async () => {
    const r = await authorDelete(new Request('http://x'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(r.status).toBe(400);
    await expectShape(ReadarrErrorResponse, r, 'DELETE /api/readarr/v1/author/{id} 400');
  });
});

describe('PUT /api/readarr/v1/author/{id}', () => {
  it('updates rootFolderPath / monitored / qualityProfileId', async () => {
    const id = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLput',
      status: 'releasing',
      rootPath: '/media/books/old',
      qualityProfileId: h.qpId,
      titleEnglish: 'P',
    });
    const r = await authorPut(
      new Request('http://x', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rootFolderPath: '/media/books/new',
          monitored: false,
          qualityProfileId: h.qpId,
        }),
      }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(r.status).toBe(200);
    await expectShape(ReadarrAuthor, r, 'PUT /api/readarr/v1/author/{id} 200');
    const updated = await getSeries(id);
    expect(updated!.rootPath).toBe('/media/books/new');
    expect(updated!.monitoring).toBe('none');
  });

  it('silently ignores unrecognized fields', async () => {
    const id = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLput2',
      status: 'releasing',
      rootPath: '/media/books/E',
      qualityProfileId: h.qpId,
      titleEnglish: 'E',
    });
    const r = await authorPut(
      new Request('http://x', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rootFolderPath: '/media/books/E', tags: [1, 2, 3] }),
      }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(r.status).toBe(200);
  });

  it('returns 404 for unknown id', async () => {
    const r = await authorPut(
      new Request('http://x', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rootFolderPath: '/x' }),
      }),
      { params: Promise.resolve({ id: '99999' }) },
    );
    expect(r.status).toBe(404);
    await expectShape(ReadarrErrorResponse, r, 'PUT /api/readarr/v1/author/{id} 404');
  });

  it('returns 400 for invalid body', async () => {
    const id = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLput3',
      status: 'releasing',
      rootPath: '/media/books/F',
      qualityProfileId: h.qpId,
      titleEnglish: 'F',
    });
    const r = await authorPut(
      new Request('http://x', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(r.status).toBe(400);
    await expectShape(ReadarrErrorResponse, r, 'PUT /api/readarr/v1/author/{id} 400');
  });
});

import { DELETE as bookDelete, PUT as bookPut } from '@/app/api/readarr/v1/book/[id]/route';
import { getVolume } from '@/server/db/volumes';
import { insertVolume } from '@/server/db/volumes';

describe('DELETE /api/readarr/v1/book/{id}', () => {
  it('deletes only the volume, not the series', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLbv',
      status: 'releasing',
      rootPath: '/media/books/V',
      qualityProfileId: h.qpId,
      titleEnglish: 'V',
    });
    const vid = await insertVolume({ seriesId: sid, number: 1, title: 'v1' });
    const r = await bookDelete(new Request('http://x'), {
      params: Promise.resolve({ id: String(vid) }),
    });
    expect(r.status).toBe(204);
    const afterVol = await getVolume(vid);
    expect(afterVol).toBeNull();
    const afterSeries = await getSeries(sid);
    expect(afterSeries).not.toBeNull();
  });

  it('returns 404 for unknown volume id', async () => {
    const r = await bookDelete(new Request('http://x'), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(r.status).toBe(404);
    await expectShape(ReadarrErrorResponse, r, 'DELETE /api/readarr/v1/book/{id} 404');
  });
});

describe('PUT /api/readarr/v1/book/{id}', () => {
  it('updates the volume title', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLbp',
      status: 'releasing',
      rootPath: '/media/books/T',
      qualityProfileId: h.qpId,
      titleEnglish: 'T',
    });
    const vid = await insertVolume({ seriesId: sid, number: 1, title: 'old title' });
    const r = await bookPut(
      new Request('http://x', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'new title' }),
      }),
      { params: Promise.resolve({ id: String(vid) }) },
    );
    expect(r.status).toBe(200);
    await expectShape(ReadarrBook, r, 'PUT /api/readarr/v1/book/{id} 200');
    const after = await getVolume(vid);
    expect(after!.title).toBe('new title');
  });

  it('accepts monitored without erroring (silently ignored)', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLbm',
      status: 'releasing',
      rootPath: '/media/books/M',
      qualityProfileId: h.qpId,
      titleEnglish: 'M',
    });
    const vid = await insertVolume({ seriesId: sid, number: 1, title: 'v' });
    const r = await bookPut(
      new Request('http://x', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ monitored: true }),
      }),
      { params: Promise.resolve({ id: String(vid) }) },
    );
    expect(r.status).toBe(200);
  });
});

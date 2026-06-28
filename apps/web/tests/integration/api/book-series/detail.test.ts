import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../helpers/seed';
import { adminCookie } from '../../../helpers/auth';
import { insertSeries } from '@/server/db/series';
import { insertLibraryFile } from '@/server/db/library-files';
import * as dal from '@/server/db/book-series';
import { GET, PATCH, DELETE } from '@/app/api/book-series/[id]/route';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
afterEach(() => { h.cleanup(); });
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe('/api/book-series/[id]', () => {
  it('returns owned + missing books merged in position order', async () => {
    const bs = await dal.createBookSeries({ name: 'HDM', contentType: 'ebook', source: 'googlebooks' });
    const s1 = await insertSeries({ contentType: 'ebook', status: 'finished', rootPath: '/t/1',
      qualityProfileId: h.qpId, titleEnglish: 'Northern Lights', isbn: '111' });
    // owned now requires a real file, not just a linked member.
    await insertLibraryFile({ seriesId: s1, path: '/t/1/Northern Lights - v01.epub', sizeBytes: 1234 });
    await dal.addMember(bs.id, s1, { position: 1, linkSource: 'auto' });
    await dal.replaceEntries(bs.id, [
      { position: 1, title: 'Northern Lights', externalRef: '111' },
      { position: 2, title: 'The Subtle Knife', externalRef: '222' },
    ]);
    const res = await GET(new Request('http://localhost'), ctx(bs.id));
    const body = await res.json() as { books: Array<{ title: string; owned: boolean; seriesId: number | null }> };
    expect(body.books.map((b) => [b.title, b.owned])).toEqual([
      ['Northern Lights', true], ['The Subtle Knife', false],
    ]);
    expect(body.books[0]!.seriesId).toBe(s1);
  });

  it('a linked member with no file is not owned (shows as missing)', async () => {
    const bs = await dal.createBookSeries({ name: 'FS', contentType: 'ebook', source: 'googlebooks' });
    // Linked series row but NO library file → monitored, not owned.
    const s1 = await insertSeries({ contentType: 'ebook', status: 'finished', rootPath: '/t/d',
      qualityProfileId: h.qpId, titleEnglish: 'Darker', isbn: 'd28', coverUrl: 'http://cover/28' });
    await dal.addMember(bs.id, s1, { position: 5, linkSource: 'auto' });
    await dal.replaceEntries(bs.id, [{ position: 5, title: 'Darker', externalRef: 'd28' }]);
    const res = await GET(new Request('http://localhost'), ctx(bs.id));
    const body = await res.json() as { books: Array<{ title: string; owned: boolean; seriesId: number | null; coverUrl: string | null }> };
    expect(body.books).toHaveLength(1);
    // Not owned, but the linked series + its cover are still surfaced.
    expect(body.books[0]).toMatchObject({ title: 'Darker', owned: false, seriesId: s1, coverUrl: 'http://cover/28' });
  });

  it('PATCH renames; DELETE removes', async () => {
    const bs = await dal.createBookSeries({ name: 'A', contentType: 'ebook', source: 'manual' });
    const patch = await PATCH(new Request('http://localhost', { method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: await adminCookie() },
      body: JSON.stringify({ name: 'B' }) }), ctx(bs.id));
    expect(patch.status).toBe(200);
    const del = await DELETE(new Request('http://localhost', { method: 'DELETE',
      headers: { cookie: await adminCookie() } }), ctx(bs.id));
    expect(del.status).toBe(200);
    expect(await dal.getBookSeries(bs.id)).toBeNull();
  });
});

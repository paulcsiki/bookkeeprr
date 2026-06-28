import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries } from '@/server/db/series';
import * as dal from '@/server/db/book-series';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
afterEach(() => { h.cleanup(); });

async function ebook(title: string): Promise<number> {
  return insertSeries({ contentType: 'ebook', status: 'finished', rootPath: `/tmp/${title}`,
    qualityProfileId: h.qpId, titleEnglish: title });
}

describe('book-series DAL', () => {
  it('creates, lists with memberCount, and reads detail in position order', async () => {
    const bs = await dal.createBookSeries({ name: 'HDM', contentType: 'ebook', source: 'manual' });
    const s2 = await ebook('The Subtle Knife');
    const s1 = await ebook('Northern Lights');
    await dal.addMember(bs.id, s2, { position: 2, linkSource: 'manual' });
    await dal.addMember(bs.id, s1, { position: 1, linkSource: 'manual' });

    const list = await dal.listBookSeries({ contentType: 'ebook' });
    expect(list).toHaveLength(1);
    expect(list[0]!.memberCount).toBe(2);

    const detail = await dal.getBookSeries(bs.id);
    expect(detail!.members.map((m) => m.series.titleEnglish)).toEqual(['Northern Lights', 'The Subtle Knife']);
  });

  it('rejects a content-type mismatch member', async () => {
    const bs = await dal.createBookSeries({ name: 'A', contentType: 'ebook', source: 'manual' });
    const audio = await insertSeries({ contentType: 'audiobook', status: 'finished', rootPath: '/tmp/a',
      qualityProfileId: h.qpId, titleEnglish: 'Audio' });
    await expect(dal.addMember(bs.id, audio, { linkSource: 'manual' })).rejects.toThrow(/content type/);
  });

  it('does not downgrade a manual link to auto', async () => {
    const bs = await dal.createBookSeries({ name: 'A', contentType: 'ebook', source: 'manual' });
    const s = await ebook('Book');
    await dal.addMember(bs.id, s, { position: 1, linkSource: 'manual' });
    await dal.addMember(bs.id, s, { position: 1, linkSource: 'auto' }); // idempotent, no throw
    const detail = await dal.getBookSeries(bs.id);
    expect(detail!.members[0]!.member.linkSource).toBe('manual');
    // Auto re-add must NOT overwrite a manually-set position.
    expect(detail!.members[0]!.member.position).toBe(1);
  });

  it('auto re-add preserves manual position even when auto sends a different position', async () => {
    const bs = await dal.createBookSeries({ name: 'A', contentType: 'ebook', source: 'manual' });
    const s = await ebook('Book');
    // User manually set position to 3.
    await dal.addMember(bs.id, s, { position: 3, linkSource: 'manual' });
    // Auto re-add sends position 99 — must be ignored.
    await dal.addMember(bs.id, s, { position: 99, linkSource: 'auto' });
    const detail = await dal.getBookSeries(bs.id);
    expect(detail!.members[0]!.member.linkSource).toBe('manual');
    expect(detail!.members[0]!.member.position).toBe(3);
  });

  it('getBookSeriesForTitle returns the owning series', async () => {
    const bs = await dal.createBookSeries({ name: 'A', contentType: 'ebook', source: 'manual' });
    const s = await ebook('Book');
    await dal.addMember(bs.id, s, { linkSource: 'manual' });
    expect((await dal.getBookSeriesForTitle(s))!.id).toBe(bs.id);
    const other = await ebook('Other');
    expect(await dal.getBookSeriesForTitle(other)).toBeNull();
  });

  it('replaceEntries swaps entries without touching members', async () => {
    const bs = await dal.createBookSeries({ name: 'A', contentType: 'ebook', source: 'googlebooks' });
    const s = await ebook('Book');
    await dal.addMember(bs.id, s, { linkSource: 'auto' });
    await dal.replaceEntries(bs.id, [{ position: 1, title: 'Book', externalRef: 'r1' },
      { position: 2, title: 'Sequel', externalRef: 'r2' }]);
    await dal.replaceEntries(bs.id, [{ position: 1, title: 'Book', externalRef: 'r1' }]);
    const detail = await dal.getBookSeries(bs.id);
    expect(detail!.entries).toHaveLength(1);
    expect(detail!.members).toHaveLength(1);
  });

  it('re-add updates position and does not throw (idempotent upsert)', async () => {
    const bs = await dal.createBookSeries({ name: 'A', contentType: 'ebook', source: 'manual' });
    const s = await ebook('Book');
    // Start as an auto link so the auto re-add is allowed to update position.
    await dal.addMember(bs.id, s, { position: 1, linkSource: 'auto' });
    // Re-add with a new position — must not throw, must update position, linkSource stays auto.
    await expect(dal.addMember(bs.id, s, { position: 5, linkSource: 'auto' })).resolves.toBeUndefined();
    const detail = await dal.getBookSeries(bs.id);
    expect(detail!.members[0]!.member.position).toBe(5);
    expect(detail!.members[0]!.member.linkSource).toBe('auto');
  });

  describe('listBookSeries — cover fallback', () => {
    it('falls back to first member cover (by position, nulls last) when saga coverUrl is null', async () => {
      const s1 = await insertSeries({ contentType: 'ebook', status: 'finished', rootPath: '/t/s1',
        qualityProfileId: h.qpId, titleEnglish: 'S1', coverUrl: 'https://example.com/s1.jpg' });
      const s2 = await insertSeries({ contentType: 'ebook', status: 'finished', rootPath: '/t/s2',
        qualityProfileId: h.qpId, titleEnglish: 'S2', coverUrl: 'https://example.com/s2.jpg' });
      const bs = await dal.createBookSeries({ name: 'Saga Fallback', contentType: 'ebook', source: 'manual', coverUrl: null });
      // s2 at position 1, s1 at position 2 — first member is s2
      await dal.addMember(bs.id, s2, { position: 1, linkSource: 'manual' });
      await dal.addMember(bs.id, s1, { position: 2, linkSource: 'manual' });

      const list = await dal.listBookSeries({ contentType: 'ebook' });
      const row = list.find((r) => r.name === 'Saga Fallback');
      expect(row).toBeDefined();
      expect(row!.coverUrl).toBe('https://example.com/s2.jpg'); // first member's cover
    });

    it('saga own coverUrl wins over member cover', async () => {
      const s = await insertSeries({ contentType: 'ebook', status: 'finished', rootPath: '/t/s3',
        qualityProfileId: h.qpId, titleEnglish: 'S3', coverUrl: 'https://example.com/member.jpg' });
      const bs = await dal.createBookSeries({ name: 'Saga Own Cover', contentType: 'ebook', source: 'manual',
        coverUrl: 'https://example.com/saga.jpg' });
      await dal.addMember(bs.id, s, { position: 1, linkSource: 'manual' });

      const list = await dal.listBookSeries({ contentType: 'ebook' });
      const row = list.find((r) => r.name === 'Saga Own Cover');
      expect(row).toBeDefined();
      expect(row!.coverUrl).toBe('https://example.com/saga.jpg');
    });

    it('returns null when neither saga nor members have a cover', async () => {
      const s = await insertSeries({ contentType: 'ebook', status: 'finished', rootPath: '/t/s4',
        qualityProfileId: h.qpId, titleEnglish: 'S4', coverUrl: null });
      const bs = await dal.createBookSeries({ name: 'Saga No Covers', contentType: 'ebook', source: 'manual', coverUrl: null });
      await dal.addMember(bs.id, s, { position: 1, linkSource: 'manual' });

      const list = await dal.listBookSeries({ contentType: 'ebook' });
      const row = list.find((r) => r.name === 'Saga No Covers');
      expect(row).toBeDefined();
      expect(row!.coverUrl).toBeNull();
    });
  });
});

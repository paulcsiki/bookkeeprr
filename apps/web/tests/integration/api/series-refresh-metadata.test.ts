import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST } from '@/app/api/series/[id]/refresh-metadata/route';
import { insertSeries } from '@/server/db/series';
import { listJobsByKind } from '@/server/db/jobs';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

async function adminCookie(): Promise<string> {
  const admin = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function req(id: string, cookie?: string): Request {
  return new Request(`http://test/api/series/${id}/refresh-metadata`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });
}

describe('POST /api/series/[id]/refresh-metadata', () => {
  it('rejects non-admins', async () => {
    const res = await POST(req(String(h.seriesId)), { params: Promise.resolve({ id: String(h.seriesId) }) });
    expect([401, 403]).toContain(res.status);
  });

  it('queues metadata_hydrate for a series without a mangadexId', async () => {
    const cookie = await adminCookie();
    const res = await POST(req(String(h.seriesId), cookie), {
      params: Promise.resolve({ id: String(h.seriesId) }),
    });
    expect(res.status).toBe(202);
    const meta = await listJobsByKind('metadata_hydrate');
    expect(meta.some((j) => (JSON.parse(j.payloadJson) as { seriesId: number }).seriesId === h.seriesId)).toBe(true);
    // No mangadexId on the default series → no volume-hydrate enqueued.
    const vol = await listJobsByKind('mangadex_volume_hydrate');
    expect(vol).toHaveLength(0);
  });

  it('also queues mangadex_volume_hydrate when the series has a mangadexId', async () => {
    const cookie = await adminCookie();
    const mid = await insertSeries({
      anilistId: 4242,
      mangadexId: '8eda5dcd-ae4a-4b58-ab08-abe39767cf33',
      status: 'releasing',
      rootPath: '/media/manga/Mdx Series',
      qualityProfileId: h.qpId,
      titleEnglish: 'Mdx Series',
    });
    const res = await POST(req(String(mid), cookie), { params: Promise.resolve({ id: String(mid) }) });
    expect(res.status).toBe(202);
    const vol = await listJobsByKind('mangadex_volume_hydrate');
    expect(vol.some((j) => (JSON.parse(j.payloadJson) as { seriesId: number }).seriesId === mid)).toBe(true);
  });

  it('also queues ebook_hydrate and book_series_detect for ebook series', async () => {
    const cookie = await adminCookie();
    const eid = await insertSeries({
      anilistId: 5050,
      contentType: 'ebook',
      status: 'finished',
      rootPath: '/media/ebooks/Ebook Series',
      qualityProfileId: h.qpId,
      titleEnglish: 'Ebook Series',
    });
    const res = await POST(req(String(eid), cookie), { params: Promise.resolve({ id: String(eid) }) });
    expect(res.status).toBe(202);
    const ebook = await listJobsByKind('ebook_hydrate');
    expect(ebook.some((j) => (JSON.parse(j.payloadJson) as { seriesId: number }).seriesId === eid)).toBe(true);
    const detect = await listJobsByKind('book_series_detect');
    expect(detect.some((j) => (JSON.parse(j.payloadJson) as { seriesId: number }).seriesId === eid)).toBe(true);
  });

  it('queues book_series_detect for audiobook series', async () => {
    const cookie = await adminCookie();
    const aid = await insertSeries({
      anilistId: 6060,
      contentType: 'audiobook',
      status: 'finished',
      rootPath: '/media/audiobooks/Audio Series',
      qualityProfileId: h.qpId,
      titleEnglish: 'Audio Series',
    });
    const res = await POST(req(String(aid), cookie), { params: Promise.resolve({ id: String(aid) }) });
    expect(res.status).toBe(202);
    const detect = await listJobsByKind('book_series_detect');
    expect(detect.some((j) => (JSON.parse(j.payloadJson) as { seriesId: number }).seriesId === aid)).toBe(true);
  });

  it('does NOT queue book_series_detect for manga series', async () => {
    const cookie = await adminCookie();
    // h.seriesId is the default manga series from seed
    const res = await POST(req(String(h.seriesId), cookie), {
      params: Promise.resolve({ id: String(h.seriesId) }),
    });
    expect(res.status).toBe(202);
    const detect = await listJobsByKind('book_series_detect');
    expect(detect.some((j) => (JSON.parse(j.payloadJson) as { seriesId: number }).seriesId === h.seriesId)).toBe(false);
  });

  it('404s for a missing series', async () => {
    const cookie = await adminCookie();
    const res = await POST(req('99999', cookie), { params: Promise.resolve({ id: '99999' }) });
    expect(res.status).toBe(404);
  });
});

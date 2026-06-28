import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';
import { POST as pausePost } from '@/app/api/downloads/[hash]/pause/route';
import { POST as resumePost } from '@/app/api/downloads/[hash]/resume/route';
import { DELETE as hashDelete } from '@/app/api/downloads/[hash]/route';
import { expectShape } from '../../helpers/assert-spec';
import { MessageResponse, OkResponse } from '@/server/openapi/schemas/downloads';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  __resetQbtForTests();
  // Seed a configured qbt connection
  await qbtConnectionSetting.set({
    host: 'qbt.local',
    port: 8080,
    username: 'admin',
    password: 'adminadmin',
    useHttps: false,
  });
  // Default fetcher: login always succeeds; control endpoints return 200
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    return { ok: true, status: 200, headers: {}, text: async () => '' };
  });
});

afterEach(() => {
  h.cleanup();
  __resetQbtForTests();
});

async function adminCookie(): Promise<string> {
  const admin = await insertUser({
    username: 'admin-ctl',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

async function userCookie(): Promise<string> {
  const u = await insertUser({
    username: 'bob-ctl',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function pauseReq(hash: string, cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request(`http://localhost/api/downloads/${hash}/pause`, { method: 'POST', headers });
}

function resumeReq(hash: string, cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request(`http://localhost/api/downloads/${hash}/resume`, { method: 'POST', headers });
}

function deleteReq(hash: string, cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request(`http://localhost/api/downloads/${hash}`, { method: 'DELETE', headers });
}

const PARAMS = (hash: string) => ({ params: Promise.resolve({ hash }) });

describe('POST /api/downloads/[hash]/pause', () => {
  it('returns 401 with no cookie', async () => {
    const res = await pausePost(pauseReq('abc', null), PARAMS('abc'));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/downloads/{hash}/pause');
  });

  it('returns 403 for non-admin', async () => {
    const res = await pausePost(pauseReq('abc', await userCookie()), PARAMS('abc'));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'POST /api/downloads/{hash}/pause');
  });

  it('returns 200 ok when qbt call succeeds', async () => {
    const res = await pausePost(pauseReq('abc123', await adminCookie()), PARAMS('abc123'));
    expect(res.status).toBe(200);
    await expectShape(OkResponse, res, 'POST /api/downloads/{hash}/pause');
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 502 when qbt call fails', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login'))
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      return { ok: false, status: 500, headers: {}, text: async () => 'error' };
    });
    const res = await pausePost(pauseReq('abc123', await adminCookie()), PARAMS('abc123'));
    expect(res.status).toBe(502);
    await expectShape(MessageResponse, res, 'POST /api/downloads/{hash}/pause');
  });

  it('returns 502 when qbt not configured', async () => {
    await qbtConnectionSetting.set({
      host: '',
      port: 8080,
      username: '',
      password: '',
      useHttps: false,
    });
    const res = await pausePost(pauseReq('abc123', await adminCookie()), PARAMS('abc123'));
    expect(res.status).toBe(502);
  });
});

describe('POST /api/downloads/[hash]/resume', () => {
  it('returns 401 with no cookie', async () => {
    const res = await resumePost(resumeReq('abc', null), PARAMS('abc'));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/downloads/{hash}/resume');
  });

  it('returns 403 for non-admin', async () => {
    const res = await resumePost(resumeReq('abc', await userCookie()), PARAMS('abc'));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'POST /api/downloads/{hash}/resume');
  });

  it('returns 200 ok when qbt call succeeds', async () => {
    const res = await resumePost(resumeReq('abc123', await adminCookie()), PARAMS('abc123'));
    expect(res.status).toBe(200);
    await expectShape(OkResponse, res, 'POST /api/downloads/{hash}/resume');
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 502 when qbt call fails', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login'))
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      return { ok: false, status: 500, headers: {}, text: async () => 'error' };
    });
    const res = await resumePost(resumeReq('abc123', await adminCookie()), PARAMS('abc123'));
    expect(res.status).toBe(502);
    await expectShape(MessageResponse, res, 'POST /api/downloads/{hash}/resume');
  });
});

describe('DELETE /api/downloads/[hash]', () => {
  it('returns 401 with no cookie', async () => {
    const res = await hashDelete(deleteReq('abc', null), PARAMS('abc'));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'DELETE /api/downloads/{hash}');
  });

  it('returns 403 for non-admin', async () => {
    const res = await hashDelete(deleteReq('abc', await userCookie()), PARAMS('abc'));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'DELETE /api/downloads/{hash}');
  });

  it('returns 200 ok when qbt call succeeds', async () => {
    const res = await hashDelete(deleteReq('cafe1234', await adminCookie()), PARAMS('cafe1234'));
    expect(res.status).toBe(200);
    await expectShape(OkResponse, res, 'DELETE /api/downloads/{hash}');
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('deletes the download row so it leaves the activity feed', async () => {
    const { insertSeries } = await import('@/server/db/series');
    const { insertDownload, getDownloadByQbtHash } = await import('@/server/db/downloads');
    const { upsertReleaseByGuid } = await import('@/server/db/releases');
    const { seedDefaultIndexer } = await import('@/server/db/indexers');
    const idx = await seedDefaultIndexer();
    const seriesId = await insertSeries({
      anilistId: 555,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: h.qpId,
      titleEnglish: 'S',
    });
    const releaseId = await upsertReleaseByGuid({
      indexerId: idx,
      indexerGuid: 'g',
      seriesId,
      title: 't',
      link: 'magnet:?xt=urn:btih:deadbeef',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId, qbtHash: 'cafe1234', status: 'queued' });
    const res = await hashDelete(deleteReq('cafe1234', await adminCookie()), PARAMS('cafe1234'));
    expect(res.status).toBe(200);
    expect(await getDownloadByQbtHash('cafe1234')).toBeNull();
  });

  it('still clears the row (200) when the qbt delete fails — cancel is best-effort', async () => {
    const { insertSeries } = await import('@/server/db/series');
    const { insertDownload, getDownloadByQbtHash } = await import('@/server/db/downloads');
    const { upsertReleaseByGuid } = await import('@/server/db/releases');
    const { seedDefaultIndexer } = await import('@/server/db/indexers');
    const idx = await seedDefaultIndexer();
    const seriesId = await insertSeries({
      anilistId: 556,
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: h.qpId,
      titleEnglish: 'S2',
    });
    const releaseId = await upsertReleaseByGuid({
      indexerId: idx,
      indexerGuid: 'g2',
      seriesId,
      title: 't',
      link: 'magnet:?xt=urn:btih:deadbeef2',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId, qbtHash: 'beef9999', status: 'queued' });
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login'))
        return { ok: true, status: 200, headers: { 'set-cookie': 'SID=abc' }, text: async () => 'Ok.' };
      return { ok: false, status: 500, headers: {}, text: async () => 'error' };
    });
    const res = await hashDelete(deleteReq('beef9999', await adminCookie()), PARAMS('beef9999'));
    expect(res.status).toBe(200); // qbt delete failed but the row is still cleared
    expect(await getDownloadByQbtHash('beef9999')).toBeNull();
  });
});

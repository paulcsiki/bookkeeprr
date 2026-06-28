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
import { insertDownload, updateDownload, listDownloads } from '@/server/db/downloads';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { POST as pauseAllPost } from '@/app/api/downloads/pause-all/route';
import { DELETE as historyDelete } from '@/app/api/downloads/history/route';
import { expectShape } from '../../helpers/assert-spec';
import {
  HistoryClearResponse,
  MessageResponse,
  OkResponse,
} from '@/server/openapi/schemas/downloads';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
  __resetQbtForTests();
  await qbtConnectionSetting.set({
    host: 'qbt.local',
    port: 8080,
    username: 'admin',
    password: 'adminadmin',
    useHttps: false,
  });
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    // torrents/info returns empty by default
    if (url.includes('/api/v2/torrents/info')) {
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
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
    username: 'admin-bulk',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

async function userCookie(): Promise<string> {
  const u = await insertUser({
    username: 'bob-bulk',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function mkReq(method: string, path: string, cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request(`http://localhost${path}`, { method, headers });
}

describe('POST /api/downloads/pause-all', () => {
  it('returns 401 with no cookie', async () => {
    const res = await pauseAllPost(mkReq('POST', '/api/downloads/pause-all', null));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/downloads/pause-all');
  });

  it('returns 403 for non-admin', async () => {
    const res = await pauseAllPost(mkReq('POST', '/api/downloads/pause-all', await userCookie()));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'POST /api/downloads/pause-all');
  });

  it('returns 200 ok with no active torrents', async () => {
    const res = await pauseAllPost(mkReq('POST', '/api/downloads/pause-all', await adminCookie()));
    expect(res.status).toBe(200);
    await expectShape(OkResponse, res, 'POST /api/downloads/pause-all');
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 502 when qbt not configured', async () => {
    await qbtConnectionSetting.set({
      host: '',
      port: 8080,
      username: '',
      password: '',
      useHttps: false,
    });
    const res = await pauseAllPost(mkReq('POST', '/api/downloads/pause-all', await adminCookie()));
    expect(res.status).toBe(502);
    await expectShape(MessageResponse, res, 'POST /api/downloads/pause-all');
  });
});

describe('DELETE /api/downloads/history', () => {
  it('returns 401 with no cookie', async () => {
    const res = await historyDelete(mkReq('DELETE', '/api/downloads/history', null));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'DELETE /api/downloads/history');
  });

  it('returns 403 for non-admin', async () => {
    const res = await historyDelete(
      mkReq('DELETE', '/api/downloads/history', await userCookie()),
    );
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'DELETE /api/downloads/history');
  });

  it('deletes completed/imported/failed rows but not active ones', async () => {
    // Seed releases and downloads in various states
    const r1 = await upsertReleaseByGuid({
      indexerId: h.indexerId,
      indexerGuid: 'bulk-g1',
      seriesId: h.seriesId,
      title: 'Completed',
      link: 'm:c1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    const r2 = await upsertReleaseByGuid({
      indexerId: h.indexerId,
      indexerGuid: 'bulk-g2',
      seriesId: h.seriesId,
      title: 'Imported',
      link: 'm:c2',
      targetKind: 'volume',
      targetLow: 2,
      targetHigh: 2,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    const r3 = await upsertReleaseByGuid({
      indexerId: h.indexerId,
      indexerGuid: 'bulk-g3',
      seriesId: h.seriesId,
      title: 'Failed',
      link: 'm:c3',
      targetKind: 'volume',
      targetLow: 3,
      targetHigh: 3,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    const r4 = await upsertReleaseByGuid({
      indexerId: h.indexerId,
      indexerGuid: 'bulk-g4',
      seriesId: h.seriesId,
      title: 'Downloading',
      link: 'm:c4',
      targetKind: 'volume',
      targetLow: 4,
      targetHigh: 4,
      sizeBytes: 0,
      publishedAt: new Date(),
    });

    const d1 = await insertDownload({ releaseId: r1, qbtHash: 'hash-c1' });
    const d2 = await insertDownload({ releaseId: r2, qbtHash: 'hash-c2' });
    const d3 = await insertDownload({ releaseId: r3, qbtHash: 'hash-c3' });
    const d4 = await insertDownload({ releaseId: r4, qbtHash: 'hash-c4' });

    await updateDownload(d1, { status: 'completed' });
    await updateDownload(d2, { status: 'imported' });
    await updateDownload(d3, { status: 'failed' });
    await updateDownload(d4, { status: 'downloading' });

    const res = await historyDelete(
      mkReq('DELETE', '/api/downloads/history', await adminCookie()),
    );
    expect(res.status).toBe(200);
    await expectShape(HistoryClearResponse, res, 'DELETE /api/downloads/history');
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(3); // completed, imported, failed

    // Only the downloading row should remain
    const remaining = await listDownloads();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(d4);
    expect(remaining[0]?.status).toBe('downloading');
  });
});

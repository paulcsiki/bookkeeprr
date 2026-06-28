import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse, MessageResponse } from '@/server/openapi/schemas/common';
import {
  SettingsOkResponse,
  StorageSettingsResponse,
} from '@/server/openapi/schemas/settings';
import {
  contentTypePathsSetting,
  torrentCleanupSetting,
  imageCacheSetting,
} from '@/server/db/settings/library';
import { GET, PUT } from '@/app/api/settings/storage/route';
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

function defaultPaths(): Record<string, { libraryRoot: string; qbtCategory: string }> {
  return {
    manga: { libraryRoot: '', qbtCategory: '' },
    comic: { libraryRoot: '', qbtCategory: '' },
    light_novel: { libraryRoot: '', qbtCategory: '' },
    ebook: { libraryRoot: '', qbtCategory: '' },
    audiobook: { libraryRoot: '', qbtCategory: '' },
  };
}

describe('GET/PUT /api/settings/storage', () => {
  it('GET requires admin', async () => {
    const res = await GET(new Request('http://t', { method: 'GET' }));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'GET /api/settings/storage (401)');
  });

  it('PUT requires admin', async () => {
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contentTypePaths: defaultPaths(),
          torrentCleanup: { mode: 'never', deleteFiles: false },
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('PUT persists both settings', async () => {
    const cookie = await adminCookie();
    const paths = defaultPaths();
    paths.manga = { libraryRoot: '/mnt/manga', qbtCategory: 'manga-cat' };
    paths.audiobook = { libraryRoot: '/mnt/audio', qbtCategory: '' };

    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          contentTypePaths: paths,
          torrentCleanup: { mode: 'after_ratio', ratio: 1.5, deleteFiles: true },
          imageCache: { enabled: true, dir: '/srv/covers' },
        }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PUT /api/settings/storage');
    expect(await res.json()).toEqual({ ok: true });

    const storedPaths = await contentTypePathsSetting.get();
    expect(storedPaths.manga).toEqual({ libraryRoot: '/mnt/manga', qbtCategory: 'manga-cat' });
    expect(storedPaths.audiobook).toEqual({ libraryRoot: '/mnt/audio', qbtCategory: '' });

    const storedCleanup = await torrentCleanupSetting.get();
    expect(storedCleanup).toEqual({ mode: 'after_ratio', ratio: 1.5, deleteFiles: true });

    const storedImageCache = await imageCacheSetting.get();
    expect(storedImageCache).toEqual({ enabled: true, dir: '/srv/covers' });
  });

  it('GET returns imageCache settings', async () => {
    const cookie = await adminCookie();
    await imageCacheSetting.set({ enabled: true, dir: '/cache' });
    const res = await GET(new Request('http://t', { method: 'GET', headers: { cookie } }));
    expect(res.status).toBe(200);
    await expectShape(StorageSettingsResponse, res, 'GET /api/settings/storage');
    const body = await res.json();
    expect(body.imageCache).toEqual({ enabled: true, dir: '/cache' });
  });

  it('PUT 422 on invalid imageCache', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          contentTypePaths: defaultPaths(),
          torrentCleanup: { mode: 'never', deleteFiles: false },
          imageCache: { enabled: 'yes', dir: 5 },
        }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it('GET returns the stored settings', async () => {
    const cookie = await adminCookie();
    await torrentCleanupSetting.set({ mode: 'after_import', deleteFiles: true });

    const res = await GET(new Request('http://t', { method: 'GET', headers: { cookie } }));
    expect(res.status).toBe(200);
    await expectShape(StorageSettingsResponse, res, 'GET /api/settings/storage');
    const body = await res.json();
    expect(body.torrentCleanup).toEqual({ mode: 'after_import', deleteFiles: true });
    expect(body.contentTypePaths.manga).toEqual({ libraryRoot: '', qbtCategory: '' });
  });

  it('PUT 422 on invalid body', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          contentTypePaths: defaultPaths(),
          torrentCleanup: { mode: 'bogus', deleteFiles: false },
        }),
      }),
    );
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'PUT /api/settings/storage (422)');
  });
});

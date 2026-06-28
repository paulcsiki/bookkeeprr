import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { SettingsOkResponse } from '@/server/openapi/schemas/settings';
import {
  AudiobookshelfGetResponse,
  CalibreGetResponse,
} from '@/server/openapi/schemas/settings-library-sync';
import {
  GET as abGet,
  PATCH as abPatch,
} from '@/app/api/settings/library-sync/audiobookshelf/route';
import { audiobookshelfSetting } from '@/server/db/settings/audiobookshelf';
import { GET as cbGet, PATCH as cbPatch } from '@/app/api/settings/library-sync/calibre/route';
import { calibreSetting } from '@/server/db/settings/calibre';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
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

function req(url: string, method: 'GET' | 'PATCH', cookie: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/settings/library-sync/audiobookshelf', () => {
  it('returns defaults with null URLs', async () => {
    const res = await abGet();
    expect(res.status).toBe(200);
    await expectShape(AudiobookshelfGetResponse, res, 'GET /api/settings/library-sync/audiobookshelf');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.baseUrl).toBeNull();
    expect(body.apiToken).toBeNull();
    expect(body.configured).toBe(false);
  });

  it('masks the apiToken when configured', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'REAL-TOKEN',
      libraryId: 'lib',
      contentTypes: ['audiobook'],
      enabled: true,
    });
    const res = await abGet();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.baseUrl).toBe('http://abs');
    expect(body.apiToken).toBe('••••••••');
    expect(body.configured).toBe(true);
  });
});

describe('PATCH /api/settings/library-sync/audiobookshelf', () => {
  it('saves a full config', async () => {
    const cookie = await adminCookie();
    const res = await abPatch(
      req('http://l/x', 'PATCH', cookie, {
        baseUrl: 'http://abs',
        apiToken: 'tok',
        libraryId: 'lib',
        contentTypes: ['audiobook'],
        enabled: true,
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PATCH /api/settings/library-sync/audiobookshelf');
    const cfg = await audiobookshelfSetting.get();
    expect(cfg.baseUrl).toBe('http://abs');
    expect(cfg.apiToken).toBe('tok');
    expect(cfg.enabled).toBe(true);
  });

  it('treats empty string apiToken as "leave unchanged"', async () => {
    const cookie = await adminCookie();
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'ORIGINAL',
      libraryId: 'lib',
      contentTypes: ['audiobook'],
      enabled: true,
    });
    const res = await abPatch(
      req('http://l/x', 'PATCH', cookie, {
        baseUrl: 'http://abs-new',
        apiToken: '',
        libraryId: 'lib',
        contentTypes: ['audiobook'],
        enabled: true,
      }),
    );
    expect(res.status).toBe(200);
    const cfg = await audiobookshelfSetting.get();
    expect(cfg.apiToken).toBe('ORIGINAL');
    expect(cfg.baseUrl).toBe('http://abs-new');
  });

  it('clears apiToken when sent as null', async () => {
    const cookie = await adminCookie();
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs',
      apiToken: 'ORIGINAL',
      libraryId: 'lib',
      contentTypes: ['audiobook'],
      enabled: true,
    });
    const res = await abPatch(
      req('http://l/x', 'PATCH', cookie, {
        baseUrl: 'http://abs',
        apiToken: null,
        libraryId: 'lib',
        contentTypes: ['audiobook'],
        enabled: true,
      }),
    );
    expect(res.status).toBe(200);
    const cfg = await audiobookshelfSetting.get();
    expect(cfg.apiToken).toBeNull();
  });

  it('returns 400 on bad body', async () => {
    const cookie = await adminCookie();
    const res = await abPatch(req('http://l/x', 'PATCH', cookie, { enabled: 'maybe' }));
    expect(res.status).toBe(400);
    await expectShape(
      ErrorResponse,
      res,
      'PATCH /api/settings/library-sync/audiobookshelf (400)',
    );
  });
});

describe('GET /api/settings/library-sync/calibre', () => {
  it('masks the password when configured', async () => {
    await calibreSetting.set({
      baseUrl: 'http://calibre',
      username: 'admin',
      password: 'REAL-PASS',
      libraryId: '0',
      contentTypes: ['ebook'],
      enabled: true,
    });
    const res = await cbGet();
    await expectShape(CalibreGetResponse, res, 'GET /api/settings/library-sync/calibre');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.password).toBe('••••••••');
    expect(body.username).toBe('admin');
    expect(body.configured).toBe(true);
  });
});

describe('PATCH /api/settings/library-sync/calibre', () => {
  it('treats empty string password as "leave unchanged"', async () => {
    const cookie = await adminCookie();
    await calibreSetting.set({
      baseUrl: 'http://calibre',
      username: 'admin',
      password: 'ORIGINAL',
      libraryId: '0',
      contentTypes: ['ebook'],
      enabled: true,
    });
    const res = await cbPatch(
      req('http://l/x', 'PATCH', cookie, {
        baseUrl: 'http://calibre',
        username: 'admin-renamed',
        password: '',
        libraryId: '0',
        contentTypes: ['ebook'],
        enabled: true,
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PATCH /api/settings/library-sync/calibre');
    const cfg = await calibreSetting.get();
    expect(cfg.password).toBe('ORIGINAL');
    expect(cfg.username).toBe('admin-renamed');
  });
});

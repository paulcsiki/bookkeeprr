import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import {
  seedDefaultIndexers,
  getIndexer,
  parseIndexerConfig,
  insertIndexer,
} from '@/server/db/indexers';
import { PATCH } from '@/app/api/indexers/[id]/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;
let filelistId: number;
let nyaaId: number;

beforeEach(async () => {
  h = await seedDb();
  const { nyaaId: nId, filelistId: fId } = await seedDefaultIndexers();
  nyaaId = nId;
  filelistId = fId;
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

function req(body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost/api/indexers/x', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/indexers/[id]', () => {
  it('saves filelist config with creds', async () => {
    const res = await PATCH(
      req(
        {
          configJson: {
            kind: 'filelist',
            queryTemplate: '{title}',
            contentTypes: ['light_novel'],
            categoryByContentType: { light_novel: 24 },
            username: 'paul',
            passkey: 'secret123',
          },
          enabled: true,
        },
        await adminCookie(),
      ),
      { params: Promise.resolve({ id: String(filelistId) }) },
    );
    expect(res.status).toBe(200);

    const row = await getIndexer(filelistId);
    const cfg = parseIndexerConfig(row!.configJson, 'filelist');
    if (cfg.kind !== 'filelist') throw new Error('expected filelist');
    expect(cfg.username).toBe('paul');
    expect(cfg.passkey).toBe('secret123');
    expect(cfg.contentTypes).toEqual(['light_novel']);
  });

  it('leaves passkey untouched when empty passkey submitted', async () => {
    const cookie = await adminCookie();
    await PATCH(
      req(
        {
          configJson: {
            kind: 'filelist',
            queryTemplate: '{title}',
            contentTypes: ['light_novel'],
            categoryByContentType: { light_novel: 24 },
            username: 'paul',
            passkey: 'original-secret',
          },
        },
        cookie,
      ),
      { params: Promise.resolve({ id: String(filelistId) }) },
    );

    const res = await PATCH(
      req(
        {
          configJson: {
            kind: 'filelist',
            queryTemplate: '{title}',
            contentTypes: ['light_novel'],
            categoryByContentType: { light_novel: 24 },
            username: 'paul-renamed',
            passkey: '',
          },
        },
        cookie,
      ),
      { params: Promise.resolve({ id: String(filelistId) }) },
    );
    expect(res.status).toBe(200);

    const row = await getIndexer(filelistId);
    const cfg = parseIndexerConfig(row!.configJson, 'filelist');
    if (cfg.kind !== 'filelist') throw new Error('expected filelist');
    expect(cfg.username).toBe('paul-renamed');
    expect(cfg.passkey).toBe('original-secret');
  });

  it('leaves torznab apiKey untouched when empty apiKey submitted', async () => {
    const cookie = await adminCookie();
    const torznabId = await insertIndexer({
      kind: 'torznab',
      name: 'Prowlarr',
      baseUrl: 'http://prowlarr:9696/1/api',
      enabled: true,
      configJson: {
        kind: 'torznab',
        queryTemplate: '{title} {extra}',
        contentTypes: ['ebook'],
        categoryByContentType: { ebook: '7020' },
        apiKey: 'original-key',
        pollIntervalSeconds: 900,
      },
    });

    const res = await PATCH(
      req(
        {
          name: 'Prowlarr-renamed',
          configJson: {
            kind: 'torznab',
            queryTemplate: '{title} {extra}',
            contentTypes: ['ebook'],
            categoryByContentType: { ebook: '7020' },
            apiKey: '', // masked on load — must keep the stored key
            pollIntervalSeconds: 900,
          },
        },
        cookie,
      ),
      { params: Promise.resolve({ id: String(torznabId) }) },
    );
    expect(res.status).toBe(200);

    const row = await getIndexer(torznabId);
    const cfg = parseIndexerConfig(row!.configJson, 'torznab');
    if (cfg.kind !== 'torznab') throw new Error('expected torznab');
    expect(cfg.apiKey).toBe('original-key');
  });

  it('saves nyaa discriminated config', async () => {
    const res = await PATCH(
      req(
        {
          configJson: {
            kind: 'nyaa',
            queryTemplate: '{title}',
            contentTypes: ['manga'],
            categoryByContentType: { manga: '3_3' },
          },
        },
        await adminCookie(),
      ),
      { params: Promise.resolve({ id: String(nyaaId) }) },
    );
    expect(res.status).toBe(200);
    const row = await getIndexer(nyaaId);
    const cfg = parseIndexerConfig(row!.configJson, 'nyaa');
    if (cfg.kind !== 'nyaa') throw new Error('expected nyaa');
    expect(cfg.categoryByContentType.manga).toBe('3_3');
  });

  it('returns 404 for unknown id', async () => {
    const res = await PATCH(req({ enabled: false }, await adminCookie()), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id format', async () => {
    const res = await PATCH(req({ enabled: false }, await adminCookie()), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for kind mismatch (filelist body to nyaa row)', async () => {
    const res = await PATCH(
      req(
        {
          configJson: {
            kind: 'filelist',
            queryTemplate: '{title}',
            contentTypes: ['light_novel'],
            categoryByContentType: { light_novel: 24 },
            username: 'paul',
            passkey: 'x',
          },
        },
        await adminCookie(),
      ),
      { params: Promise.resolve({ id: String(nyaaId) }) },
    );
    expect(res.status).toBe(400);
  });
});

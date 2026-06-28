import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import {
  ApiKeyGetResponse,
  ApiKeyPatchResponse,
  ApiKeyTestResponse,
  ConnectionTestFailureResponse,
} from '@/server/openapi/schemas/settings';
import { GET, PATCH } from '@/app/api/settings/api-key/route';
import { POST as TestPost } from '@/app/api/settings/api-key/test/route';
import { apiKeySetting } from '@/server/db/settings/api-key';
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

function patchReq(cookie: string, body: unknown): Request {
  return new Request('http://t/api/settings/api-key', {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/settings/api-key', () => {
  it('reports disabled with an empty key by default', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await expectShape(ApiKeyGetResponse, res, 'GET /api/settings/api-key');
    expect(body.enabled).toBe(false);
    expect(body.key).toBe('');
    expect(body.createdAt).toBeNull();
  });

  it('returns the plaintext key when enabled (NOT masked)', async () => {
    await apiKeySetting.set({ key: 'the-actual-key', createdAt: '2026-06-10T00:00:00.000Z' });
    const res = await GET();
    const body = await expectShape(ApiKeyGetResponse, res, 'GET /api/settings/api-key');
    expect(body.enabled).toBe(true);
    expect(body.key).toBe('the-actual-key');
  });
});

describe('PATCH /api/settings/api-key', () => {
  it('generate returns the new plaintext key', async () => {
    const res = await PATCH(patchReq(await adminCookie(), { action: 'generate' }));
    expect(res.status).toBe(200);
    const body = await expectShape(ApiKeyPatchResponse, res, 'PATCH /api/settings/api-key');
    expect(body.enabled).toBe(true);
    expect(body.key.length).toBeGreaterThan(20);
    expect((await apiKeySetting.get()).key).toBe(body.key);
  });

  it('disable clears the key', async () => {
    await apiKeySetting.set({ key: 'old-key', createdAt: '2026-06-10T00:00:00.000Z' });
    const res = await PATCH(patchReq(await adminCookie(), { action: 'disable' }));
    expect(res.status).toBe(200);
    const body = await expectShape(
      ApiKeyPatchResponse,
      res,
      'PATCH /api/settings/api-key (disable)',
    );
    expect(body).toEqual({ enabled: false, key: '', createdAt: null });
    expect((await apiKeySetting.get()).key).toBeNull();
  });

  it('400 on an unknown action', async () => {
    const res = await PATCH(patchReq(await adminCookie(), { action: 'rotate' }));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PATCH /api/settings/api-key (400)');
  });
});

describe('POST /api/settings/api-key/test', () => {
  it('200 with a note when auth is disabled', async () => {
    const res = await TestPost(new Request('http://t', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await expectShape(ApiKeyTestResponse, res, 'POST /api/settings/api-key/test');
    expect(body.note).toMatch(/auth disabled/);
  });

  it('200 on a matching X-Api-Key header', async () => {
    await apiKeySetting.set({ key: 'k1', createdAt: '2026-06-10T00:00:00.000Z' });
    const res = await TestPost(
      new Request('http://t', { method: 'POST', headers: { 'x-api-key': 'k1' } }),
    );
    expect(res.status).toBe(200);
    const body = await expectShape(ApiKeyTestResponse, res, 'POST /api/settings/api-key/test');
    expect(body.note).toBeUndefined();
  });

  it('401 on mismatch', async () => {
    await apiKeySetting.set({ key: 'k1', createdAt: '2026-06-10T00:00:00.000Z' });
    const res = await TestPost(
      new Request('http://t', { method: 'POST', headers: { 'x-api-key': 'wrong' } }),
    );
    expect(res.status).toBe(401);
    await expectShape(
      ConnectionTestFailureResponse,
      res,
      'POST /api/settings/api-key/test (401)',
    );
  });
});

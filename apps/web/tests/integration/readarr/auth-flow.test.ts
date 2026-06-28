import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { apiKeySetting } from '@/server/db/settings/api-key';
import { firstRunCompleteSetting } from '@/server/db/settings/first-run';
import { insertUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { proxy as middleware } from '@/proxy';
import { NextRequest } from 'next/server';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  await insertUser({
    username: 'fixture',
    passwordHash: await hashPassword('fixture-password'),
    role: 'admin',
    mustChangePassword: false,
  });
  await firstRunCompleteSetting.set(true);
});
afterEach(() => h.cleanup());

function req(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers });
}

describe('middleware auth enforcement', () => {
  it('passes through /api/health unauthenticated even when key is set', async () => {
    await apiKeySetting.set({ key: 'k', createdAt: '2026-05-24T00:00:00Z' });
    const r = await middleware(req('/api/health'));
    expect(r.status).not.toBe(401);
  });

  it('passes through /api/first-run/status unauthenticated even when key is set', async () => {
    await apiKeySetting.set({ key: 'k', createdAt: '2026-05-24T00:00:00Z' });
    const r = await middleware(req('/api/first-run/status'));
    expect(r.status).not.toBe(401);
  });

  it('returns 401 on /api/series when key is set and header is missing', async () => {
    await apiKeySetting.set({ key: 'k', createdAt: '2026-05-24T00:00:00Z' });
    const r = await middleware(req('/api/series'));
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body).toEqual({ message: 'Unauthorized' });
  });

  it('returns 401 on /api/readarr/v1/system/status when key is set and header is wrong', async () => {
    await apiKeySetting.set({ key: 'k', createdAt: '2026-05-24T00:00:00Z' });
    const r = await middleware(req('/api/readarr/v1/system/status', { 'x-api-key': 'wrong' }));
    expect(r.status).toBe(401);
  });

  it('passes /api/series with correct key', async () => {
    await apiKeySetting.set({ key: 'k', createdAt: '2026-05-24T00:00:00Z' });
    const r = await middleware(req('/api/series', { 'x-api-key': 'k' }));
    expect(r.status).not.toBe(401);
  });

  it('returns 401 on /api/series with no auth and no key set (auth required because users exist)', async () => {
    const r = await middleware(req('/api/series'));
    expect(r.status).toBe(401);
  });
});

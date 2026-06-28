import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { apiKeySetting } from '@/server/db/settings/api-key';
import { firstRunCompleteSetting } from '@/server/db/settings/first-run';
import { proxy as middleware } from '@/proxy';
import { NextRequest } from 'next/server';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

function req(
  path: string,
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {},
): NextRequest {
  const url = new URL(path, 'http://localhost:3000');
  const headerObj = new Headers(headers);
  if (Object.keys(cookies).length > 0) {
    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    headerObj.set('cookie', cookieStr);
  }
  return new NextRequest(url, { headers: headerObj });
}

describe('middleware first-run gate', () => {
  it('redirects to /first-run when no users exist', async () => {
    const r = await middleware(req('/library'));
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toContain('/first-run');
  });

  it('allows /first-run when no users exist', async () => {
    const r = await middleware(req('/first-run'));
    expect(r.status).not.toBe(307);
  });

  it('allows /api/first-run/* when no users exist', async () => {
    const r = await middleware(req('/api/first-run/status'));
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(307);
  });

  it('allows /api/health when no users exist', async () => {
    const r = await middleware(req('/api/health'));
    expect(r.status).not.toBe(401);
  });

  it('allows /api/auth/* when no users exist (so register-first-admin works)', async () => {
    const r = await middleware(req('/api/auth/register-first-admin'));
    expect(r.status).not.toBe(401);
  });
});

describe('middleware authentication when users exist', () => {
  beforeEach(async () => {
    const hash = await hashPassword('password123');
    await insertUser({
      username: 'alice',
      passwordHash: hash,
      role: 'admin',
      mustChangePassword: false,
    });
    await firstRunCompleteSetting.set(true);
  });

  it('redirects unauthenticated /library to /login?next=/library', async () => {
    const r = await middleware(req('/library'));
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toContain('/login');
    expect(r.headers.get('location')).toContain('next=%2Flibrary');
  });

  it('allows /login when unauthenticated', async () => {
    const r = await middleware(req('/login'));
    expect(r.status).not.toBe(307);
  });

  it('returns 401 on /api/series without auth', async () => {
    const r = await middleware(req('/api/series'));
    expect(r.status).toBe(401);
  });

  it('allows /api/series with valid session cookie', async () => {
    const u = await insertUser({
      username: 'bob',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const r = await middleware(req('/api/series', {}, { bookkeeprr_session: s.token }));
    expect(r.status).not.toBe(401);
  });

  it('allows /api/series with valid X-Api-Key', async () => {
    await apiKeySetting.set({ key: 'k', createdAt: '2026-05-24T00:00:00Z' });
    const r = await middleware(req('/api/series', { 'x-api-key': 'k' }));
    expect(r.status).not.toBe(401);
  });

  it('rejects /api/series with wrong X-Api-Key and no session', async () => {
    await apiKeySetting.set({ key: 'k', createdAt: '2026-05-24T00:00:00Z' });
    const r = await middleware(req('/api/series', { 'x-api-key': 'wrong' }));
    expect(r.status).toBe(401);
  });

  it('allows the anonymous mobile bootstrap endpoints without auth', async () => {
    // The mobile app calls these before it has any token; gating them behind
    // auth makes login impossible (handshake 401 → browser never opens).
    expect((await middleware(req('/api/mobile/handshake'))).status).not.toBe(401);
    expect((await middleware(req('/api/mobile/version'))).status).not.toBe(401);
    expect((await middleware(req('/api/mobile/exchange'))).status).not.toBe(401);
  });

  it('still requires auth for token-bearing mobile endpoints', async () => {
    expect((await middleware(req('/api/mobile/push/register'))).status).toBe(401);
  });

  it('disabled user with valid session is rejected', async () => {
    const u = await insertUser({
      username: 'carol',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    const { updateUser } = await import('@/server/db/users');
    await updateUser(u.id, { disabled: true });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const r = await middleware(req('/api/series', {}, { bookkeeprr_session: s.token }));
    expect(r.status).toBe(401);
  });

  it('mustChangePassword user is redirected to /change-password', async () => {
    const u = await insertUser({
      username: 'dave',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: true,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const r = await middleware(req('/library', {}, { bookkeeprr_session: s.token }));
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toContain('/change-password');
  });

  it('mustChangePassword user can still hit /api/auth/change-password', async () => {
    const u = await insertUser({
      username: 'evan',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: true,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const r = await middleware(
      req('/api/auth/change-password', {}, { bookkeeprr_session: s.token }),
    );
    expect(r.status).not.toBe(307);
    expect(r.status).not.toBe(401);
  });

  it('still allows /api/health unauthenticated', async () => {
    const r = await middleware(req('/api/health'));
    expect(r.status).not.toBe(401);
  });
});

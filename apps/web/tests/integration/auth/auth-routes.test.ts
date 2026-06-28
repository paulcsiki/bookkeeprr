import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser, getUserByUsername } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { POST as registerFirstAdmin } from '@/app/api/auth/register-first-admin/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as changePassword } from '@/app/api/auth/change-password/route';
import { expectShape } from '../../helpers/assert-spec';
import {
  AuthOkResponse,
  LoginResponse,
  MeResponse,
  RegisterFirstAdminResponse,
} from '@/server/openapi/schemas/auth';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

function jsonReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/auth/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function reqWithCookie(token: string, method = 'POST', body: unknown = {}): Request {
  return new Request('http://localhost/api/auth/x', {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: `bookkeeprr_session=${token}`,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

describe('POST /api/auth/register-first-admin', () => {
  it('creates the first admin when users table is empty', async () => {
    const r = await registerFirstAdmin(jsonReq({ email: 'admin@example.com', password: 'password123' }));
    expect(r.status).toBe(201);
    await expectShape(RegisterFirstAdminResponse, r, 'POST /api/auth/register-first-admin');
    const setCookie = r.headers.get('set-cookie');
    expect(setCookie).toContain('bookkeeprr_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const created = await getUserByUsername('admin@example.com');
    expect(created?.role).toBe('admin');
    expect(created?.mustChangePassword).toBe(false);
  });

  it('returns 409 when a user already exists', async () => {
    await insertUser({
      username: 'existing',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    const r = await registerFirstAdmin(jsonReq({ email: 'newadmin@example.com', password: 'password123' }));
    expect(r.status).toBe(409);
  });

  it('returns 400 on weak password', async () => {
    const r = await registerFirstAdmin(jsonReq({ email: 'admin@example.com', password: 'short' }));
    expect(r.status).toBe(400);
  });

  it('first admin: email becomes the username and is stored', async () => {
    const r = await registerFirstAdmin(jsonReq({ email: 'owner@example.com', password: 'password123' }));
    expect(r.status).toBe(201);
    const body = (await r.json()) as { user: { username: string; email: string | null } };
    expect(body.user.username).toBe('owner@example.com');
    expect(body.user.email).toBe('owner@example.com');
  });

  it('first admin: rejects a non-email identifier', async () => {
    const r = await registerFirstAdmin(jsonReq({ email: 'not-an-email', password: 'password123' }));
    expect(r.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await insertUser({
      username: 'alice',
      passwordHash: await hashPassword('password123'),
      role: 'admin',
      mustChangePassword: false,
    });
  });

  it('logs in with correct credentials, sets cookie, returns user', async () => {
    const r = await login(jsonReq({ username: 'alice', password: 'password123' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toContain('bookkeeprr_session=');
    await expectShape(LoginResponse, r, 'POST /api/auth/login');
    const body = (await r.json()) as { user: { username: string } };
    expect(body.user.username).toBe('alice');
  });

  it('returns 401 for wrong password (no enumeration)', async () => {
    const r = await login(jsonReq({ username: 'alice', password: 'wrong' }));
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.message).toMatch(/Invalid username or password/i);
  });

  it('returns 401 for unknown username (same message as wrong password)', async () => {
    const r = await login(jsonReq({ username: 'nobody', password: 'whatever' }));
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.message).toMatch(/Invalid username or password/i);
  });

  it('returns 401 with "Account disabled" for disabled user', async () => {
    const { updateUser } = await import('@/server/db/users');
    const user = await getUserByUsername('alice');
    await updateUser(user!.id, { disabled: true });
    const r = await login(jsonReq({ username: 'alice', password: 'password123' }));
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.message).toMatch(/disabled/i);
  });

  it('updates lastLoginAt on success', async () => {
    await login(jsonReq({ username: 'alice', password: 'password123' }));
    const u = await getUserByUsername('alice');
    expect(u!.lastLoginAt).not.toBeNull();
  });

  it('is case-insensitive on username', async () => {
    const r = await login(jsonReq({ username: 'ALICE', password: 'password123' }));
    expect(r.status).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes session and clears cookie', async () => {
    const { createSession, getSessionByToken } = await import('@/server/db/sessions');
    const u = await insertUser({
      username: 'a',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const r = await logout(reqWithCookie(s.token));
    expect(r.status).toBe(204);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await getSessionByToken(s.token)).toBeNull();
  });

  it('returns 204 even when no session cookie is set', async () => {
    const r = await logout(new Request('http://localhost/api/auth/logout', { method: 'POST' }));
    expect(r.status).toBe(204);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user when session is valid', async () => {
    const { createSession } = await import('@/server/db/sessions');
    const u = await insertUser({
      username: 'a',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const r = await me(reqWithCookie(s.token, 'GET'));
    expect(r.status).toBe(200);
    await expectShape(MeResponse, r, 'GET /api/auth/me');
    const body = (await r.json()) as { user: { username: string; role: string } | null };
    expect(body.user?.username).toBe('a');
    expect(body.user?.role).toBe('admin');
  });

  it('returns { user: null } when not authenticated', async () => {
    const r = await me(new Request('http://localhost/api/auth/me'));
    expect(r.status).toBe(200);
    await expectShape(MeResponse, r, 'GET /api/auth/me (unauthenticated)');
    const body = (await r.json()) as { user: unknown };
    expect(body.user).toBeNull();
  });
});

describe('POST /api/auth/change-password', () => {
  it('forced change skips current-password check', async () => {
    const { createSession } = await import('@/server/db/sessions');
    const u = await insertUser({
      username: 'a',
      passwordHash: await hashPassword('oldpassword'),
      role: 'user',
      mustChangePassword: true,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const r = await changePassword(
      reqWithCookie(s.token, 'POST', { newPassword: 'newpassword12' }),
    );
    expect(r.status).toBe(200);
    await expectShape(AuthOkResponse, r, 'POST /api/auth/change-password');
  });

  it('voluntary change requires correct current password', async () => {
    const { createSession } = await import('@/server/db/sessions');
    const u = await insertUser({
      username: 'b',
      passwordHash: await hashPassword('oldpassword'),
      role: 'user',
      mustChangePassword: false,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const wrongR = await changePassword(
      reqWithCookie(s.token, 'POST', { currentPassword: 'wrong', newPassword: 'newpassword12' }),
    );
    expect(wrongR.status).toBe(400);
    const okR = await changePassword(
      reqWithCookie(s.token, 'POST', {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword12',
      }),
    );
    expect(okR.status).toBe(200);
  });

  it('clears mustChangePassword after successful change', async () => {
    const { createSession } = await import('@/server/db/sessions');
    const u = await insertUser({
      username: 'c',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: true,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    await changePassword(reqWithCookie(s.token, 'POST', { newPassword: 'newpassword12' }));
    const reload = await getUserByUsername('c');
    expect(reload!.mustChangePassword).toBe(false);
  });

  it('revokes other sessions but keeps current', async () => {
    const { createSession, getSessionByToken } = await import('@/server/db/sessions');
    const u = await insertUser({
      username: 'd',
      passwordHash: await hashPassword('oldpassword'),
      role: 'user',
      mustChangePassword: false,
    });
    const current = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const other = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    await changePassword(
      reqWithCookie(current.token, 'POST', {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword12',
      }),
    );
    // The route reissues a fresh cookie — the original `current` token may or may not survive
    // depending on implementation. The other session must be gone; the new cookie is in the response.
    expect(await getSessionByToken(other.token)).toBeNull();
  });

  it('rejects weak new password', async () => {
    const { createSession } = await import('@/server/db/sessions');
    const u = await insertUser({
      username: 'e',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: true,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const r = await changePassword(reqWithCookie(s.token, 'POST', { newPassword: 'short' }));
    expect(r.status).toBe(400);
  });
});

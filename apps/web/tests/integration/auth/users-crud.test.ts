import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser, getUser, getUserByUsername } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { GET as listGET, POST as listPOST } from '@/app/api/users/route';
import { PATCH as patchById, DELETE as deleteById } from '@/app/api/users/[id]/route';
import { POST as resetPassword } from '@/app/api/users/[id]/reset-password/route';
import { expectShape } from '../../helpers/assert-spec';
import {
  UserCreatedResponse,
  UserOkResponse,
  UsersListResponse,
} from '@/server/openapi/schemas/users';

let h: SeedHandle;
let adminId: number;
let adminToken: string;
let userToken: string;
let userId: number;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  const admin = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('adminpass'),
    role: 'admin',
    mustChangePassword: false,
  });
  adminId = admin.id;
  const adminSession = await createSession({
    userId: admin.id,
    userAgent: null,
    ipAddress: null,
  });
  adminToken = adminSession.token;
  const user = await insertUser({
    username: 'regular',
    passwordHash: await hashPassword('userpass'),
    role: 'user',
    mustChangePassword: false,
  });
  userId = user.id;
  const userSession = await createSession({
    userId: user.id,
    userAgent: null,
    ipAddress: null,
  });
  userToken = userSession.token;
});
afterEach(() => h.cleanup());

function req(method: string, body: unknown, token: string): Request {
  return new Request('http://localhost/api/users/x', {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: `bookkeeprr_session=${token}`,
    },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body),
  });
}

describe('GET /api/users', () => {
  it('admin can list users', async () => {
    const r = await listGET(req('GET', null, adminToken));
    expect(r.status).toBe(200);
    await expectShape(UsersListResponse, r, 'GET /api/users');
    const body = (await r.json()) as { users: Array<{ username: string }> };
    expect(body.users.map((u) => u.username).sort()).toEqual(['admin', 'regular']);
  });

  it('non-admin gets 403', async () => {
    const r = await listGET(req('GET', null, userToken));
    expect(r.status).toBe(403);
  });

  it('omits passwordHash in response', async () => {
    const r = await listGET(req('GET', null, adminToken));
    const body = (await r.json()) as { users: Array<Record<string, unknown>> };
    for (const u of body.users) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.password_hash).toBeUndefined();
    }
  });
});

describe('POST /api/users', () => {
  it('admin creates a new user', async () => {
    const r = await listPOST(
      req(
        'POST',
        { username: 'newbie', password: 'password123', role: 'user', mustChangePassword: true },
        adminToken,
      ),
    );
    expect(r.status).toBe(201);
    await expectShape(UserCreatedResponse, r, 'POST /api/users');
    const created = await getUserByUsername('newbie');
    expect(created?.role).toBe('user');
    expect(created?.mustChangePassword).toBe(true);
  });

  it('non-admin gets 403', async () => {
    const r = await listPOST(
      req('POST', { username: 'x', password: 'password123', role: 'user' }, userToken),
    );
    expect(r.status).toBe(403);
  });

  it('rejects weak password', async () => {
    const r = await listPOST(
      req('POST', { username: 'weak', password: 'short', role: 'user' }, adminToken),
    );
    expect(r.status).toBe(400);
  });

  it('returns 409 on duplicate username', async () => {
    const r = await listPOST(
      req('POST', { username: 'admin', password: 'password123', role: 'user' }, adminToken),
    );
    expect(r.status).toBe(409);
  });
});

describe('PATCH /api/users/[id]', () => {
  it('admin can change role', async () => {
    const r = await patchById(req('PATCH', { role: 'admin' }, adminToken), {
      params: Promise.resolve({ id: String(userId) }),
    });
    expect(r.status).toBe(200);
    await expectShape(UserOkResponse, r, 'PATCH /api/users/{id}');
    const reload = await getUser(userId);
    expect(reload!.role).toBe('admin');
  });

  it('admin can disable a user', async () => {
    const r = await patchById(req('PATCH', { disabled: true }, adminToken), {
      params: Promise.resolve({ id: String(userId) }),
    });
    expect(r.status).toBe(200);
    const reload = await getUser(userId);
    expect(reload!.disabled).toBe(true);
  });

  it('last-admin guard prevents demoting the only admin', async () => {
    const r = await patchById(req('PATCH', { role: 'user' }, adminToken), {
      params: Promise.resolve({ id: String(adminId) }),
    });
    expect(r.status).toBe(409);
  });

  it('admin cannot disable themselves', async () => {
    const r = await patchById(req('PATCH', { disabled: true }, adminToken), {
      params: Promise.resolve({ id: String(adminId) }),
    });
    expect(r.status).toBe(409);
  });

  it('non-admin gets 403', async () => {
    const r = await patchById(req('PATCH', { role: 'admin' }, userToken), {
      params: Promise.resolve({ id: String(userId) }),
    });
    expect(r.status).toBe(403);
  });
});

describe('DELETE /api/users/[id]', () => {
  it('admin can delete a user', async () => {
    const r = await deleteById(req('DELETE', null, adminToken), {
      params: Promise.resolve({ id: String(userId) }),
    });
    expect(r.status).toBe(204);
    expect(await getUser(userId)).toBeNull();
  });

  it('last-admin guard prevents deleting the only admin', async () => {
    const r = await deleteById(req('DELETE', null, adminToken), {
      params: Promise.resolve({ id: String(adminId) }),
    });
    expect(r.status).toBe(409);
  });

  it('admin cannot delete themselves even with other admins', async () => {
    await insertUser({
      username: 'admin2',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    const r = await deleteById(req('DELETE', null, adminToken), {
      params: Promise.resolve({ id: String(adminId) }),
    });
    expect(r.status).toBe(409);
  });

  it('non-admin gets 403', async () => {
    const r = await deleteById(req('DELETE', null, userToken), {
      params: Promise.resolve({ id: String(userId) }),
    });
    expect(r.status).toBe(403);
  });
});

describe('POST /api/users/[id]/reset-password', () => {
  it('admin resets target user password and revokes their sessions', async () => {
    const { getSessionByToken } = await import('@/server/db/sessions');
    const userSession = await createSession({
      userId,
      userAgent: null,
      ipAddress: null,
    });
    const r = await resetPassword(
      req('POST', { newPassword: 'newpassword12', mustChangePassword: true }, adminToken),
      { params: Promise.resolve({ id: String(userId) }) },
    );
    expect(r.status).toBe(200);
    await expectShape(UserOkResponse, r, 'POST /api/users/{id}/reset-password');
    const reload = await getUser(userId);
    expect(reload!.mustChangePassword).toBe(true);
    expect(await getSessionByToken(userSession.token)).toBeNull();
  });

  it('rejects weak password', async () => {
    const r = await resetPassword(req('POST', { newPassword: 'short' }, adminToken), {
      params: Promise.resolve({ id: String(userId) }),
    });
    expect(r.status).toBe(400);
  });

  it('non-admin gets 403', async () => {
    const r = await resetPassword(req('POST', { newPassword: 'newpassword12' }, userToken), {
      params: Promise.resolve({ id: String(userId) }),
    });
    expect(r.status).toBe(403);
  });
});

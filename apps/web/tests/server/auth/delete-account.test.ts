import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser, getUser } from '@/server/db/users';
import { createSession, getSessionByToken } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { DELETE } from '@/app/api/auth/me/route';
import { expectShape } from '../../helpers/assert-spec';
import { AuthOkResponse } from '@/server/openapi/schemas/auth';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

async function makeUserWithSession(
  username = 'alice',
  password = 'hunter22correct',
): Promise<{ userId: number; token: string; passwordHash: string }> {
  const passwordHash = await hashPassword(password);
  const user = await insertUser({
    username,
    passwordHash,
    role: 'user',
    mustChangePassword: false,
  });
  const session = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  return { userId: user.id, token: session.token, passwordHash };
}

function deleteReq(cookie: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/auth/me', {
    method: 'DELETE',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('DELETE /api/auth/me', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(deleteReq(null, { currentPassword: 'anything' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when password is incorrect', async () => {
    const { token } = await makeUserWithSession('bob', 'correctpassword');
    const res = await DELETE(
      deleteReq(`bookkeeprr_session=${token}`, { currentPassword: 'wrongpassword' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when currentPassword is missing from body', async () => {
    const { token } = await makeUserWithSession('carol', 'correctpassword');
    const res = await DELETE(deleteReq(`bookkeeprr_session=${token}`, {}));
    expect(res.status).toBe(400);
  });

  it('deletes the user when the correct password is supplied', async () => {
    const { userId, token } = await makeUserWithSession('dave', 'correctpassword');
    const res = await DELETE(
      deleteReq(`bookkeeprr_session=${token}`, { currentPassword: 'correctpassword' }),
    );
    expect(res.status).toBe(200);
    await expectShape(AuthOkResponse, res, 'DELETE /api/auth/me');
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    // User is gone.
    expect(await getUser(userId)).toBeNull();
  });

  it('deletes all sessions when the user is deleted', async () => {
    const { userId, token } = await makeUserWithSession('eve', 'correctpassword');
    // Create a second session.
    const s2 = await createSession({ userId, userAgent: null, ipAddress: null });

    await DELETE(
      deleteReq(`bookkeeprr_session=${token}`, { currentPassword: 'correctpassword' }),
    );

    expect(await getSessionByToken(token)).toBeNull();
    expect(await getSessionByToken(s2.token)).toBeNull();
  });

  it('clears the session cookie in the response', async () => {
    const { token } = await makeUserWithSession('frank', 'correctpassword');
    const res = await DELETE(
      deleteReq(`bookkeeprr_session=${token}`, { currentPassword: 'correctpassword' }),
    );
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('bookkeeprr_session=');
    expect(setCookie).toContain('Max-Age=0');
  });
});

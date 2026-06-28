import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession, getSessionByToken } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { POST } from '@/app/api/auth/logout/all/route';
import { expectShape } from '../../helpers/assert-spec';
import { AuthOkResponse } from '@/server/openapi/schemas/auth';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

async function makeUserWithSessions(
  username = 'alice',
  sessionCount = 1,
): Promise<{ userId: number; tokens: string[] }> {
  const user = await insertUser({
    username,
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const tokens: string[] = [];
  for (let i = 0; i < sessionCount; i++) {
    const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
    tokens.push(s.token);
  }
  return { userId: user.id, tokens };
}

function postReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/auth/logout/all', { method: 'POST', headers });
}

describe('POST /api/auth/logout/all', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(postReq(null));
    expect(res.status).toBe(401);
  });

  it('returns 200 with ok:true for an authenticated request', async () => {
    const { tokens } = await makeUserWithSessions('bob');
    const res = await POST(postReq(`bookkeeprr_session=${tokens[0]}`));
    expect(res.status).toBe(200);
    await expectShape(AuthOkResponse, res, 'POST /api/auth/logout/all');
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('revokes all session rows for the user', async () => {
    const { tokens } = await makeUserWithSessions('carol', 3);

    // All sessions exist before.
    for (const t of tokens) {
      expect(await getSessionByToken(t)).not.toBeNull();
    }

    // Revoke using the first session token.
    const res = await POST(postReq(`bookkeeprr_session=${tokens[0]}`));
    expect(res.status).toBe(200);

    // All sessions are gone after.
    for (const t of tokens) {
      expect(await getSessionByToken(t)).toBeNull();
    }
  });

  it('clears the session cookie in the response', async () => {
    const { tokens } = await makeUserWithSessions('dave');
    const res = await POST(postReq(`bookkeeprr_session=${tokens[0]}`));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('bookkeeprr_session=');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('does not revoke sessions belonging to other users', async () => {
    const { tokens: aliceTokens } = await makeUserWithSessions('alice2');
    const { tokens: bobTokens } = await makeUserWithSessions('bob2');

    // Alice logs out of all sessions.
    await POST(postReq(`bookkeeprr_session=${aliceTokens[0]}`));

    // Bob's session survives.
    expect(await getSessionByToken(bobTokens[0]!)).not.toBeNull();
  });
});

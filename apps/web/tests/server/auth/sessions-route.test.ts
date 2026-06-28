import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession, getSessionByToken } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { GET } from '@/app/api/auth/sessions/route';
import { DELETE } from '@/app/api/auth/sessions/[tokenPrefix]/route';
import { expectShape } from '../../helpers/assert-spec';
import { AuthOkResponse, SessionsListResponse } from '@/server/openapi/schemas/auth';

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
    const s = await createSession({
      userId: user.id,
      userAgent: `Browser ${i}`,
      ipAddress: `10.0.0.${i + 1}`,
    });
    tokens.push(s.token);
  }
  return { userId: user.id, tokens };
}

function getReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/auth/sessions', { method: 'GET', headers });
}

function deleteReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/auth/sessions/prefix', { method: 'DELETE', headers });
}

function fakeParams(prefix: string): { params: Promise<{ tokenPrefix: string }> } {
  return { params: Promise.resolve({ tokenPrefix: prefix }) };
}

describe('GET /api/auth/sessions', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
  });

  it('returns the list of sessions for the authenticated user', async () => {
    const { tokens } = await makeUserWithSessions('alice', 2);
    const res = await GET(getReq(`bookkeeprr_session=${tokens[0]}`));
    expect(res.status).toBe(200);
    await expectShape(SessionsListResponse, res, 'GET /api/auth/sessions');
    const body = (await res.json()) as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(2);
  });

  it('marks the current session as current:true and others as current:false', async () => {
    const { tokens } = await makeUserWithSessions('bob', 2);
    const res = await GET(getReq(`bookkeeprr_session=${tokens[0]}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: Array<{ id: string; current: boolean }> };
    const currentSessions = body.sessions.filter((s) => s.current);
    expect(currentSessions).toHaveLength(1);
    expect(currentSessions[0]!.id).toBe(tokens[0]!.slice(0, 12));
  });

  it('does not expose the full token — only the first 12 characters', async () => {
    const { tokens } = await makeUserWithSessions('carol', 1);
    const res = await GET(getReq(`bookkeeprr_session=${tokens[0]}`));
    const body = (await res.json()) as { sessions: Array<{ id: string }> };
    expect(body.sessions[0]!.id).toHaveLength(12);
    // The id must be the prefix of the token, not the full token.
    expect(body.sessions[0]!.id).toBe(tokens[0]!.slice(0, 12));
    expect(body.sessions[0]!.id.length).toBeLessThan(tokens[0]!.length);
  });

  it('does not include sessions belonging to other users', async () => {
    const { tokens: aliceTokens } = await makeUserWithSessions('alice2', 2);
    await makeUserWithSessions('bob2', 3);
    const res = await GET(getReq(`bookkeeprr_session=${aliceTokens[0]}`));
    const body = (await res.json()) as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(2);
  });
});

describe('DELETE /api/auth/sessions/:tokenPrefix', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(deleteReq(null), fakeParams('abc123'));
    expect(res.status).toBe(401);
  });

  it('revokes a non-current session by prefix', async () => {
    const { tokens } = await makeUserWithSessions('dave', 2);
    const targetPrefix = tokens[1]!.slice(0, 12);
    const res = await DELETE(
      deleteReq(`bookkeeprr_session=${tokens[0]}`),
      fakeParams(targetPrefix),
    );
    expect(res.status).toBe(200);
    await expectShape(AuthOkResponse, res, 'DELETE /api/auth/sessions/{tokenPrefix}');
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(await getSessionByToken(tokens[1]!)).toBeNull();
    expect(await getSessionByToken(tokens[0]!)).not.toBeNull();
  });

  it('returns 400 when the prefix matches the current session', async () => {
    const { tokens } = await makeUserWithSessions('eve', 2);
    const currentPrefix = tokens[0]!.slice(0, 12);
    const res = await DELETE(
      deleteReq(`bookkeeprr_session=${tokens[0]}`),
      fakeParams(currentPrefix),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the prefix does not match any session', async () => {
    const { tokens } = await makeUserWithSessions('frank', 1);
    const res = await DELETE(
      deleteReq(`bookkeeprr_session=${tokens[0]}`),
      fakeParams('000000000000'),
    );
    expect(res.status).toBe(404);
  });

  it('does not revoke sessions belonging to other users', async () => {
    const { tokens: aliceTokens } = await makeUserWithSessions('alice3', 1);
    const { tokens: bobTokens } = await makeUserWithSessions('bob3', 1);
    // Alice tries to revoke Bob's session
    const bobPrefix = bobTokens[0]!.slice(0, 12);
    const res = await DELETE(
      deleteReq(`bookkeeprr_session=${aliceTokens[0]}`),
      fakeParams(bobPrefix),
    );
    expect(res.status).toBe(404);
    expect(await getSessionByToken(bobTokens[0]!)).not.toBeNull();
  });
});

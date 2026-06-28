import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { generateApiKey } from '@/server/db/api-keys';
import { GET, POST } from '@/app/api/auth/me/api-keys/route';
import { DELETE } from '@/app/api/auth/me/api-keys/[id]/route';
import { expectShape } from '../../helpers/assert-spec';
import {
  ApiKeyCreatedResponse,
  ApiKeysListResponse,
  AuthOkResponse,
} from '@/server/openapi/schemas/auth';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

async function makeUserWithSession(
  username = 'alice',
): Promise<{ userId: number; cookie: string }> {
  const user = await insertUser({
    username,
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const session = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  return { userId: user.id, cookie: `bookkeeprr_session=${session.token}` };
}

/** Add a minimal cookies shim so authenticateRequest can call req.cookies.get() */
function withCookiesShim(req: Request, cookie: string | null): Request {
  const cookieMap: Record<string, string> = {};
  if (cookie !== null) {
    for (const part of cookie.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k) cookieMap[k.trim()] = rest.join('=');
    }
  }
  Object.defineProperty(req, 'cookies', {
    value: { get: (name: string) => cookieMap[name] ? { value: cookieMap[name] } : undefined },
    configurable: true,
  });
  return req;
}

function getReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return withCookiesShim(
    new Request('http://localhost/api/auth/me/api-keys', { method: 'GET', headers }),
    cookie,
  );
}

function postReq(cookie: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return withCookiesShim(
    new Request('http://localhost/api/auth/me/api-keys', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    cookie,
  );
}

function deleteReq(id: number, cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return withCookiesShim(
    new Request(`http://localhost/api/auth/me/api-keys/${id}`, {
      method: 'DELETE',
      headers,
    }),
    cookie,
  );
}

describe('GET /api/auth/me/api-keys', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
  });

  it('returns empty array when no keys exist', async () => {
    const { cookie } = await makeUserWithSession();
    const res = await GET(getReq(cookie));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: unknown[] };
    expect(body.keys).toHaveLength(0);
  });

  it('returns existing keys for the user', async () => {
    const { userId, cookie } = await makeUserWithSession();
    await generateApiKey(userId, 'first');
    await generateApiKey(userId, 'second');
    const res = await GET(getReq(cookie));
    await expectShape(ApiKeysListResponse, res, 'GET /api/auth/me/api-keys');
    const body = (await res.json()) as { keys: Array<{ name: string; keyPrefix: string }> };
    expect(body.keys).toHaveLength(2);
    // Keys should not expose plaintext hash
    for (const k of body.keys) {
      expect(k.keyPrefix).toHaveLength(8);
      expect((k as unknown as Record<string, unknown>).keyHash).toBeUndefined();
      expect((k as unknown as Record<string, unknown>).plaintext).toBeUndefined();
    }
  });
});

describe('POST /api/auth/me/api-keys', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(postReq(null, { name: 'test' }));
    expect(res.status).toBe(401);
  });

  it('generates a new key and returns plaintext', async () => {
    const { cookie } = await makeUserWithSession();
    const res = await POST(postReq(cookie, { name: 'my-key' }));
    expect(res.status).toBe(201);
    await expectShape(ApiKeyCreatedResponse, res, 'POST /api/auth/me/api-keys');
    const body = (await res.json()) as {
      id: number;
      name: string;
      keyPrefix: string;
      plaintext: string;
    };
    expect(body.name).toBe('my-key');
    expect(body.plaintext).toMatch(/^bkr_/);
    expect(body.keyPrefix).toHaveLength(8);
  });

  it('returns 400 for empty name', async () => {
    const { cookie } = await makeUserWithSession();
    const res = await POST(postReq(cookie, { name: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing name', async () => {
    const { cookie } = await makeUserWithSession();
    const res = await POST(postReq(cookie, {}));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/auth/me/api-keys/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await DELETE(deleteReq(1, null), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('revokes an existing key', async () => {
    const { userId, cookie } = await makeUserWithSession();
    const { id } = await generateApiKey(userId, 'to-delete');
    const res = await DELETE(deleteReq(id, cookie), { params: Promise.resolve({ id: String(id) }) });
    expect(res.status).toBe(200);
    await expectShape(AuthOkResponse, res, 'DELETE /api/auth/me/api-keys/{id}');
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent key', async () => {
    const { cookie } = await makeUserWithSession();
    const res = await DELETE(deleteReq(99999, cookie), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const { cookie } = await makeUserWithSession();
    const res = await DELETE(deleteReq(0, cookie), {
      params: Promise.resolve({ id: 'notanumber' }),
    });
    expect(res.status).toBe(400);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST, TIMEOUT_MS } from '@/app/api/integrations/novelupdates/resolve/route';
import * as resolveModule from '@/server/integrations/novelupdates/resolve';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await h.cleanup();
});

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

async function userCookie(): Promise<string> {
  const u = await insertUser({
    username: 'bob',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function postReq(cookie: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/integrations/novelupdates/resolve', {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('POST /api/integrations/novelupdates/resolve', () => {
  it('returns the resolved slug for a high-confidence match', async () => {
    vi.spyOn(resolveModule, 'resolveNuSlug').mockResolvedValueOnce({
      match: 'high',
      slug: 'mushoku-tensei',
      candidateTitle: 'Mushoku Tensei',
    });
    const res = await POST(
      postReq(await adminCookie(), { title: 'Mushoku Tensei', altTitles: [] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      match: 'high',
      slug: 'mushoku-tensei',
      candidateTitle: 'Mushoku Tensei',
    });
  });

  it('returns none on timeout (driven by fake timers)', async () => {
    vi.spyOn(resolveModule, 'resolveNuSlug').mockImplementationOnce(
      () => new Promise(() => {}), // never resolves
    );
    vi.useFakeTimers();
    const cookie = await adminCookie();
    const promise = POST(postReq(cookie, { title: 'Slow', altTitles: [] }));
    // Drive the route's internal setTimeout to fire deterministically.
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    const res = await promise;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match).toBe('none');
  });

  it('returns 200 no-match when resolveNuSlug throws (silent degradation)', async () => {
    vi.spyOn(resolveModule, 'resolveNuSlug').mockRejectedValueOnce(new Error('NU HTTP 500'));
    const res = await POST(postReq(await adminCookie(), { title: 'boom', altTitles: [] }));
    // Spec: silent degradation on errors — returns 200 with no-match payload.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match).toBe('none');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await POST(postReq(null, { title: 'x', altTitles: [] }));
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users', async () => {
    const res = await POST(postReq(await userCookie(), { title: 'x', altTitles: [] }));
    expect(res.status).toBe(403);
  });

  it('returns 422 on missing title', async () => {
    const res = await POST(postReq(await adminCookie(), { altTitles: [] }));
    expect(res.status).toBe(422);
  });

  it('returns 400 on malformed json', async () => {
    const cookie = await adminCookie();
    const req = new Request('http://localhost/api/integrations/novelupdates/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

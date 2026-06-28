import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { GET, POST } from '@/app/api/series/[id]/volumes/route';
import { listVolumesBySeries } from '@/server/db/volumes';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

async function adminCookie(): Promise<string> {
  const u = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22-correct'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

async function userCookie(): Promise<string> {
  const u = await insertUser({
    username: 'bob',
    passwordHash: await hashPassword('hunter22-correct'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function ctx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function postReq(cookie: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/series/x/volumes', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/series/[id]/volumes', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await POST(postReq(null, { from: 1, to: 3 }), ctx(h.seriesId));
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users with 403', async () => {
    const res = await POST(postReq(await userCookie(), { from: 1, to: 3 }), ctx(h.seriesId));
    expect(res.status).toBe(403);
  });

  it('creates a range of volumes and is idempotent on a second call', async () => {
    const cookie = await adminCookie();
    // seedDb already created volume 1, so a from:1..to:3 range should create
    // just 2 + 3.
    const first = await POST(postReq(cookie, { from: 1, to: 3 }), ctx(h.seriesId));
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { created: number; ids: number[] };
    expect(firstBody.created).toBe(2);
    expect(firstBody.ids).toHaveLength(2);

    const rows1 = await listVolumesBySeries(h.seriesId);
    expect(rows1.map((v) => v.number).sort((a, b) => a - b)).toEqual([1, 2, 3]);

    // Repeating returns created:0 — nothing new to add.
    const second = await POST(postReq(cookie, { from: 1, to: 3 }), ctx(h.seriesId));
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { created: number };
    expect(secondBody.created).toBe(0);

    const rows2 = await listVolumesBySeries(h.seriesId);
    expect(rows2).toHaveLength(3);
  });

  it('rejects from > to with 400', async () => {
    const res = await POST(postReq(await adminCookie(), { from: 5, to: 3 }), ctx(h.seriesId));
    expect(res.status).toBe(400);
  });

  it('rejects ranges larger than 999 volumes', async () => {
    const res = await POST(postReq(await adminCookie(), { from: 1, to: 1500 }), ctx(h.seriesId));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the series does not exist', async () => {
    const res = await POST(postReq(await adminCookie(), { from: 1, to: 1 }), ctx(99999));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id parameter', async () => {
    const res = await POST(postReq(await adminCookie(), { from: 1, to: 1 }), ctx('abc'));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/series/[id]/volumes', () => {
  it('lists the volumes for a series', async () => {
    const res = await GET(new Request('http://localhost/api/series/x/volumes'), ctx(h.seriesId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { volumes: Array<{ id: number; number: number }> };
    // seedDb inserts volume 1 by default.
    expect(body.volumes.length).toBeGreaterThanOrEqual(1);
    expect(body.volumes.some((v) => v.number === 1)).toBe(true);
  });

  it('returns 404 when the series does not exist', async () => {
    const res = await GET(new Request('http://localhost/api/series/x/volumes'), ctx(99999));
    expect(res.status).toBe(404);
  });
});

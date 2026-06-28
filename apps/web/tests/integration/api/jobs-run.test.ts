import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST } from '@/app/api/jobs/run/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { listJobsByKind } from '@/server/db/jobs';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse, MessageResponse } from '@/server/openapi/schemas/common';
import { JobRunResponse } from '@/server/openapi/schemas/jobs';

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

function req(cookie: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/jobs/run', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/jobs/run', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const res = await POST(req(null, { kind: 'qbt_watch' }));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/jobs/run');
  });

  it('rejects non-admin users with 403', async () => {
    const res = await POST(req(await userCookie(), { kind: 'qbt_watch' }));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'POST /api/jobs/run');
  });

  it('rejects an unknown job kind with 400', async () => {
    const res = await POST(req(await adminCookie(), { kind: 'definitely_not_a_job' }));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/jobs/run');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await POST(req(await adminCookie(), '{ not json'));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/jobs/run');
  });

  it('self-enqueues and drains qbt_watch when no jobs are pending', async () => {
    // qBit is unconfigured in the seeded DB, so qbt-watch returns the
    // "not-configured" skip — it still drains successfully (no failure).
    const before = await listJobsByKind('qbt_watch');
    const pendingBefore = before.filter((j) => j.status === 'pending').length;
    expect(pendingBefore).toBe(0);

    const res = await POST(req(await adminCookie(), { kind: 'qbt_watch' }));
    expect(res.status).toBe(200);
    await expectShape(JobRunResponse, res, 'POST /api/jobs/run');
    const body = (await res.json()) as { ok: boolean; kind: string; ran: number };
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('qbt_watch');
    // The route self-enqueues one job for cron-driven kinds; the runner
    // drains it.
    expect(body.ran).toBeGreaterThanOrEqual(1);

    const after = await listJobsByKind('qbt_watch');
    const pendingAfter = after.filter((j) => j.status === 'pending').length;
    expect(pendingAfter).toBe(0);
  });

  it('returns ran=0 for non-self-enqueueable kinds with no pending jobs', async () => {
    // `import` is never self-enqueued — qbt_watch enqueues it on completion.
    // With nothing pending the runner is idle.
    const res = await POST(req(await adminCookie(), { kind: 'import' }));
    expect(res.status).toBe(200);
    await expectShape(JobRunResponse, res, 'POST /api/jobs/run');
    const body = (await res.json()) as { ok: boolean; ran: number };
    expect(body.ok).toBe(true);
    expect(body.ran).toBe(0);
  });
});

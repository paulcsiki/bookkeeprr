import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { GET } from '@/app/api/audit/events/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { insertAuditEvent } from '@/server/db/audit';

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
    username: 'u',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

async function seedEvents(): Promise<void> {
  await insertAuditEvent({
    timestamp: new Date(1_700_000_000_000),
    actorKind: 'user',
    actorUserId: 1,
    actorUsername: 'admin',
    action: 'auth.login_success',
    targetKind: null,
    targetId: null,
    metadata: null,
    peerIp: null,
    clientIp: null,
    userAgent: null,
  });
  await insertAuditEvent({
    timestamp: new Date(1_700_001_000_000),
    actorKind: 'anonymous',
    actorUserId: null,
    actorUsername: null,
    action: 'auth.login_failure',
    targetKind: null,
    targetId: null,
    metadata: { reason: 'bad_password' },
    peerIp: null,
    clientIp: null,
    userAgent: null,
  });
}

describe('GET /api/audit/events', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('returns 401 for unauthenticated callers', async () => {
    const res = await GET(new Request('http://localhost/api/audit/events'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    const cookie = await userCookie();
    const res = await GET(
      new Request('http://localhost/api/audit/events', { headers: { cookie } }),
    );
    expect(res.status).toBe(403);
  });

  it('returns paginated events sorted by timestamp desc', async () => {
    const cookie = await adminCookie();
    await seedEvents();
    const res = await GET(
      new Request('http://localhost/api/audit/events', { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ action: string }>; total: number };
    expect(body.total).toBe(2);
    expect(body.rows[0]?.action).toBe('auth.login_failure');
    expect(body.rows[1]?.action).toBe('auth.login_success');
  });

  it('filters by action', async () => {
    const cookie = await adminCookie();
    await seedEvents();
    const res = await GET(
      new Request('http://localhost/api/audit/events?action=auth.login_failure', {
        headers: { cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; total: number };
    expect(body.total).toBe(1);
  });

  it('honours limit + offset', async () => {
    const cookie = await adminCookie();
    await seedEvents();
    const res = await GET(
      new Request('http://localhost/api/audit/events?limit=1&offset=1', {
        headers: { cookie },
      }),
    );
    const body = (await res.json()) as { rows: Array<{ action: string }>; total: number };
    expect(body.total).toBe(2);
    expect(body.rows).toHaveLength(1);
  });

  it('rejects invalid limit values', async () => {
    const cookie = await adminCookie();
    const res = await GET(
      new Request('http://localhost/api/audit/events?limit=999', { headers: { cookie } }),
    );
    expect(res.status).toBe(400);
  });
});

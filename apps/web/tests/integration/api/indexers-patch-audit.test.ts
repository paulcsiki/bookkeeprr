import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { PATCH } from '@/app/api/indexers/[id]/route';
import { insertIndexer } from '@/server/db/indexers';
import { queryAuditEvents } from '@/server/db/audit';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

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

function req(cookie: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/indexers/x', {
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function mkIndexer(): Promise<number> {
  return insertIndexer({
    kind: 'nyaa',
    name: 'patch-target',
    baseUrl: 'https://example.test',
    enabled: false,
    configJson: {
      kind: 'nyaa',
      queryTemplate: '{title}',
      contentTypes: ['manga'],
      categoryByContentType: { manga: '3_1' },
      pollIntervalSeconds: 900,
    },
  });
}

describe('PATCH /api/indexers/[id] admin gate + audit (retrofit)', () => {
  it('returns 401 with no cookie', async () => {
    const id = await mkIndexer();
    const res = await PATCH(req(null, { enabled: true }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const id = await mkIndexer();
    const res = await PATCH(req(await userCookie(), { enabled: true }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(403);
  });

  it('emits indexer.update audit on a successful PATCH', async () => {
    const id = await mkIndexer();
    const res = await PATCH(req(await adminCookie(), { enabled: true, name: 'renamed' }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(200);
    const { rows } = await queryAuditEvents({ action: 'indexer.update' }, { limit: 10, offset: 0 });
    const row = rows.find((r) => r.targetId === String(id));
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toContain('enabled');
    expect(meta.changedFields).toContain('name');
  });
});

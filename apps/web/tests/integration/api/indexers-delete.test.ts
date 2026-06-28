import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { DELETE } from '@/app/api/indexers/[id]/route';
import { insertIndexer, getIndexer } from '@/server/db/indexers';
import { queryAuditEvents } from '@/server/db/audit';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { MessageResponse, OkResponse } from '@/server/openapi/schemas/indexers';

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

function req(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/indexers/x', { method: 'DELETE', headers });
}

async function mkIndexer(): Promise<number> {
  return insertIndexer({
    kind: 'nyaa',
    name: 'target',
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

describe('DELETE /api/indexers/[id]', () => {
  it('returns 401 with no cookie', async () => {
    const id = await mkIndexer();
    const res = await DELETE(req(null), { params: Promise.resolve({ id: String(id) }) });
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'DELETE /api/indexers/{id}');
  });

  it('returns 403 for non-admin', async () => {
    const id = await mkIndexer();
    const res = await DELETE(req(await userCookie()), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'DELETE /api/indexers/{id}');
  });

  it('returns 400 on non-numeric id', async () => {
    const res = await DELETE(req(await adminCookie()), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'DELETE /api/indexers/{id}');
  });

  it('returns 404 when id not found', async () => {
    const res = await DELETE(req(await adminCookie()), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'DELETE /api/indexers/{id}');
  });

  it('returns 200, removes row, and emits indexer.delete audit', async () => {
    const id = await mkIndexer();
    const res = await DELETE(req(await adminCookie()), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(200);
    await expectShape(OkResponse, res, 'DELETE /api/indexers/{id}');
    expect(await getIndexer(id)).toBeNull();

    const { rows } = await queryAuditEvents({ action: 'indexer.delete' }, { limit: 10, offset: 0 });
    const row = rows.find((r) => r.targetId === String(id));
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.kind).toBe('nyaa');
    expect(meta.name).toBe('target');
  });
});

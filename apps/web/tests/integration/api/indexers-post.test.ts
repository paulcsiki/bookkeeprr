import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST, GET } from '@/app/api/indexers/route';
import { listIndexers } from '@/server/db/indexers';
import { queryAuditEvents } from '@/server/db/audit';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import {
  IndexerCreateResponse,
  IndexersListResponse,
  MessageResponse,
} from '@/server/openapi/schemas/indexers';

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

function postReq(cookie: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/indexers', {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function getReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/indexers', { method: 'GET', headers });
}

const VALID_BODY = {
  kind: 'nyaa',
  name: 'test-extra',
  baseUrl: 'https://example.test',
  enabled: false,
  configJson: {
    kind: 'nyaa',
    queryTemplate: '{title}',
    contentTypes: ['manga'],
    categoryByContentType: { manga: '3_1' },
    pollIntervalSeconds: 900,
  },
};

describe('POST /api/indexers', () => {
  it('returns 401 with no cookie', async () => {
    const res = await POST(postReq(null, VALID_BODY));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/indexers');
  });

  it('returns 403 for non-admin', async () => {
    const res = await POST(postReq(await userCookie(), VALID_BODY));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'POST /api/indexers');
  });

  it('returns 422 on missing required field', async () => {
    const { name: _name, ...withoutName } = VALID_BODY;
    const res = await POST(postReq(await adminCookie(), withoutName));
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'POST /api/indexers');
  });

  it('returns 422 on pollIntervalSeconds out of range', async () => {
    const res = await POST(
      postReq(await adminCookie(), {
        ...VALID_BODY,
        configJson: { ...VALID_BODY.configJson, pollIntervalSeconds: 30 },
      }),
    );
    expect(res.status).toBe(422);
  });

  it('returns 400 on kind <-> configJson.kind mismatch', async () => {
    const res = await POST(
      postReq(await adminCookie(), {
        ...VALID_BODY,
        kind: 'filelist',
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/indexers');
  });

  it('returns 201 on happy path; row persisted; audit row emitted', async () => {
    const before = (await listIndexers()).length;
    const res = await POST(postReq(await adminCookie(), VALID_BODY));
    expect(res.status).toBe(201);
    await expectShape(IndexerCreateResponse, res, 'POST /api/indexers');
    const body = (await res.json()) as { id: number };
    expect(body.id).toBeGreaterThan(0);
    expect((await listIndexers()).length).toBe(before + 1);

    const { rows } = await queryAuditEvents({ action: 'indexer.create' }, { limit: 10, offset: 0 });
    const row = rows.find((r) => r.targetId === String(body.id));
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.kind).toBe('nyaa');
    expect(meta.name).toBe('test-extra');
  });
});

describe('GET /api/indexers (admin gate retrofit)', () => {
  it('returns 401 with no cookie', async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'GET /api/indexers');
  });

  it('returns 403 for non-admin', async () => {
    const res = await GET(getReq(await userCookie()));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'GET /api/indexers');
  });

  it('returns 200 for admin with the list', async () => {
    const res = await GET(getReq(await adminCookie()));
    expect(res.status).toBe(200);
    await expectShape(IndexersListResponse, res, 'GET /api/indexers');
    const body = (await res.json()) as { indexers: unknown[] };
    expect(Array.isArray(body.indexers)).toBe(true);
  });
});

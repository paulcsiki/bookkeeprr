import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer, getIndexer } from '@/server/db/indexers';
import { GET as LIST } from '@/app/api/indexers/route';
import { PATCH } from '@/app/api/indexers/[id]/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { IndexersListResponse, OkResponse } from '@/server/openapi/schemas/indexers';

let h: SeedHandle;
let indexerId: number;

beforeEach(async () => {
  h = await seedDb();
  indexerId = await seedDefaultIndexer();
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

function getReq(cookie: string): Request {
  return new Request('http://localhost/api/indexers', {
    method: 'GET',
    headers: { cookie },
  });
}

describe('indexers API', () => {
  it('GET /api/indexers returns the list', async () => {
    const res = await LIST(getReq(await adminCookie()));
    expect(res.status).toBe(200);
    await expectShape(IndexersListResponse, res, 'GET /api/indexers');
    const body = await res.json();
    const kinds = (body.indexers as Array<{ kind: string }>).map((r) => r.kind).sort();
    expect(kinds).toEqual(['filelist', 'nyaa']);
  });

  it('PATCH /api/indexers/[id] toggles enabled', async () => {
    const res = await PATCH(
      new Request('http://t', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: await adminCookie() },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id: String(indexerId) }) },
    );
    expect(res.status).toBe(200);
    await expectShape(OkResponse, res, 'PATCH /api/indexers/{id}');
    const row = await getIndexer(indexerId);
    expect(row?.enabled).toBe(false);
  });

  it('PATCH validates configJson shape', async () => {
    const res = await PATCH(
      new Request('http://t', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: await adminCookie() },
        body: JSON.stringify({ configJson: { queryTemplate: 42 } }),
      }),
      { params: Promise.resolve({ id: String(indexerId) }) },
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PATCH /api/indexers/{id}');
  });

  it('PATCH rejects non-digit id with 400', async () => {
    const res = await PATCH(
      new Request('http://t', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: await adminCookie() },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id: 'foo' }) },
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PATCH /api/indexers/{id}');
  });

  it('PATCH returns 404 on missing indexer', async () => {
    const res = await PATCH(
      new Request('http://t', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: await adminCookie() },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id: '9999' }) },
    );
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'PATCH /api/indexers/{id}');
  });
});

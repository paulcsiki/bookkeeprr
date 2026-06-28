import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse, MessageResponse } from '@/server/openapi/schemas/common';
import {
  AutoGrabConfigResponse,
  AutoGrabPatchResponse,
} from '@/server/openapi/schemas/settings';
import { GET, PATCH } from '@/app/api/settings/auto-grab/route';
import { autoGrabSetting } from '@/server/db/settings/auto-grab';
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

function getReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/settings/auto-grab', { method: 'GET', headers });
}

function patchReq(cookie: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/settings/auto-grab', {
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/settings/auto-grab', () => {
  it('returns 401 with no cookie', async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'GET /api/settings/auto-grab (401)');
  });

  it('returns 403 for non-admin', async () => {
    const res = await GET(getReq(await userCookie()));
    expect(res.status).toBe(403);
  });

  it('returns the current setting (defaults)', async () => {
    const res = await GET(getReq(await adminCookie()));
    expect(res.status).toBe(200);
    await expectShape(AutoGrabConfigResponse, res, 'GET /api/settings/auto-grab');
    const body = (await res.json()) as { dryRun: boolean };
    expect(body.dryRun).toBe(false);
  });
});

describe('PATCH /api/settings/auto-grab', () => {
  it('returns 401 with no cookie', async () => {
    const res = await PATCH(patchReq(null, { dryRun: true }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const res = await PATCH(patchReq(await userCookie(), { dryRun: true }));
    expect(res.status).toBe(403);
  });

  it('returns 422 on non-boolean dryRun', async () => {
    const res = await PATCH(patchReq(await adminCookie(), { dryRun: 'yes' }));
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'PATCH /api/settings/auto-grab (422)');
  });

  it('persists + emits audit row on success', async () => {
    const res = await PATCH(patchReq(await adminCookie(), { dryRun: true }));
    expect(res.status).toBe(200);
    await expectShape(AutoGrabPatchResponse, res, 'PATCH /api/settings/auto-grab');
    const cfg = await autoGrabSetting.get();
    expect(cfg.dryRun).toBe(true);

    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    const row = rows.find((r) => r.targetId === 'auto-grab');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toEqual(['dryRun']);
  });
});

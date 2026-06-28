import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { HousekeepingVisibilityPatchResponse } from '@/server/openapi/schemas/settings';
import { PATCH } from '@/app/api/settings/housekeeping/visibility/route';
import { visibilityRetentionSetting } from '@/server/db/settings/visibility-retention';
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
  return new Request('http://localhost/api/settings/housekeeping/visibility', {
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('PATCH /api/settings/housekeeping/visibility', () => {
  it('returns 401 with no cookie', async () => {
    const res = await PATCH(req(null, { auditRetentionDays: 60 }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const res = await PATCH(req(await userCookie(), { auditRetentionDays: 60 }));
    expect(res.status).toBe(403);
  });

  it('returns 422 for out-of-range auditRetentionDays', async () => {
    const res = await PATCH(req(await adminCookie(), { auditRetentionDays: 0 }));
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'PATCH /api/settings/housekeeping/visibility (422)');
  });

  it('returns 422 for non-numeric input', async () => {
    const res = await PATCH(req(await adminCookie(), { logRetentionDays: 'long' }));
    expect(res.status).toBe(422);
  });

  it('persists a partial PATCH and emits one audit row', async () => {
    const res = await PATCH(req(await adminCookie(), { auditRetentionDays: 60 }));
    expect(res.status).toBe(200);
    await expectShape(
      HousekeepingVisibilityPatchResponse,
      res,
      'PATCH /api/settings/housekeeping/visibility',
    );
    const cfg = await visibilityRetentionSetting.get();
    expect(cfg.auditRetentionDays).toBe(60);
    expect(cfg.logRetentionDays).toBe(7); // default preserved

    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    const row = rows.find((r) => r.targetId === 'housekeeping-visibility');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toEqual(['auditRetentionDays']);
  });

  it('persists a full PATCH and audits both changed fields', async () => {
    const res = await PATCH(
      req(await adminCookie(), { auditRetentionDays: 60, logRetentionDays: 14 }),
    );
    expect(res.status).toBe(200);

    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    const row = rows.find((r) => r.targetId === 'housekeeping-visibility');
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toEqual(['auditRetentionDays', 'logRetentionDays']);
  });
});

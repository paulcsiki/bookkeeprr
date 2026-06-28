import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { HousekeepingBackupsPatchResponse } from '@/server/openapi/schemas/settings';
import { PATCH } from '@/app/api/settings/housekeeping/backups/route';
import { backupRetentionSetting } from '@/server/db/settings/housekeeping';
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
  return new Request('http://localhost/api/settings/housekeeping/backups', {
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('PATCH /api/settings/housekeeping/backups', () => {
  it('returns 401 with no cookie', async () => {
    const res = await PATCH(req(null, { daily: 7 }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const res = await PATCH(req(await userCookie(), { daily: 7 }));
    expect(res.status).toBe(403);
  });

  it('returns 422 for out-of-range daily', async () => {
    const res = await PATCH(req(await adminCookie(), { daily: -1 }));
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'PATCH /api/settings/housekeeping/backups (422)');
  });

  it('returns 422 for non-numeric input', async () => {
    const res = await PATCH(req(await adminCookie(), { daily: 'never' }));
    expect(res.status).toBe(422);
  });

  it('persists a partial PATCH and emits one audit row', async () => {
    const res = await PATCH(req(await adminCookie(), { daily: 7 }));
    expect(res.status).toBe(200);
    await expectShape(
      HousekeepingBackupsPatchResponse,
      res,
      'PATCH /api/settings/housekeeping/backups',
    );
    const cfg = await backupRetentionSetting.get();
    expect(cfg.daily).toBe(7);
    expect(cfg.monthlyDay1).toBe(12); // default preserved

    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    const row = rows.find((r) => r.targetId === 'housekeeping-backups');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toEqual(['daily']);
  });

  it('persists a full PATCH and audits both changed fields', async () => {
    const res = await PATCH(req(await adminCookie(), { daily: 7, monthlyDay1: 6 }));
    expect(res.status).toBe(200);

    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    const row = rows.find((r) => r.targetId === 'housekeeping-backups');
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toEqual(['daily', 'monthlyDay1']);
  });
});

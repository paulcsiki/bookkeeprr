import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { MatcherAdultFilterPatchResponse } from '@/server/openapi/schemas/settings';
import { PATCH } from '@/app/api/settings/matcher/adult-filter/route';
import { adultFilterSetting } from '@/server/db/settings/matcher';
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
  return new Request('http://localhost/api/settings/matcher/adult-filter', {
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('PATCH /api/settings/matcher/adult-filter', () => {
  it('returns 401 with no cookie', async () => {
    const res = await PATCH(req(null, { enabled: false }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const res = await PATCH(req(await userCookie(), { enabled: false }));
    expect(res.status).toBe(403);
  });

  it('returns 422 on non-boolean enabled', async () => {
    const res = await PATCH(req(await adminCookie(), { enabled: 'yes' }));
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'PATCH /api/settings/matcher/adult-filter (422)');
  });

  it('returns 422 when a blockedCategories entry exceeds 32 chars', async () => {
    const res = await PATCH(req(await adminCookie(), { blockedCategories: ['a'.repeat(33)] }));
    expect(res.status).toBe(422);
  });

  it('persists a partial PATCH (enabled only)', async () => {
    const res = await PATCH(req(await adminCookie(), { enabled: false }));
    expect(res.status).toBe(200);
    await expectShape(
      MatcherAdultFilterPatchResponse,
      res,
      'PATCH /api/settings/matcher/adult-filter',
    );
    const cfg = await adultFilterSetting.get();
    expect(cfg.enabled).toBe(false);
    expect(cfg.blockedCategories).toEqual(['4_1', '4_2', '4_3', '4_4']); // default preserved

    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    const row = rows.find((r) => r.targetId === 'matcher-adult-filter');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toEqual(['enabled']);
  });

  it('persists a full PATCH and audits both changed fields', async () => {
    const res = await PATCH(
      req(await adminCookie(), {
        enabled: false,
        blockedCategories: ['4_1', 'filelist-99'],
      }),
    );
    expect(res.status).toBe(200);
    const cfg = await adultFilterSetting.get();
    expect(cfg.enabled).toBe(false);
    expect(cfg.blockedCategories).toEqual(['4_1', 'filelist-99']);

    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    const row = rows.find((r) => r.targetId === 'matcher-adult-filter');
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toEqual(['blockedCategories', 'enabled']);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { MatcherWeightsPatchResponse } from '@/server/openapi/schemas/settings';
import { PATCH } from '@/app/api/settings/matcher/weights/route';
import { scoringWeightsSetting } from '@/server/db/settings/matcher';
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
  return new Request('http://localhost/api/settings/matcher/weights', {
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('PATCH /api/settings/matcher/weights', () => {
  it('returns 401 with no cookie', async () => {
    const res = await PATCH(req(null, { groupTopWeight: 200 }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const res = await PATCH(req(await userCookie(), { groupTopWeight: 200 }));
    expect(res.status).toBe(403);
  });

  it('returns 422 on out-of-range value', async () => {
    const res = await PATCH(req(await adminCookie(), { groupTopWeight: 9999 }));
    expect(res.status).toBe(422);
    await expectShape(ErrorResponse, res, 'PATCH /api/settings/matcher/weights (422)');
  });

  it('returns 422 on non-numeric value', async () => {
    const res = await PATCH(req(await adminCookie(), { groupTopWeight: 'lots' }));
    expect(res.status).toBe(422);
  });

  it('persists a partial PATCH and emits one audit row', async () => {
    const res = await PATCH(req(await adminCookie(), { groupTopWeight: 200 }));
    expect(res.status).toBe(200);
    await expectShape(MatcherWeightsPatchResponse, res, 'PATCH /api/settings/matcher/weights');
    const cfg = await scoringWeightsSetting.get();
    expect(cfg.groupTopWeight).toBe(200);
    expect(cfg.groupStepDown).toBe(10); // default preserved

    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    const row = rows.find((r) => r.targetId === 'matcher-weights');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toEqual(['groupTopWeight']);
  });

  it('persists a full PATCH and audits all changed fields', async () => {
    const res = await PATCH(
      req(await adminCookie(), {
        groupTopWeight: 150,
        groupStepDown: 15,
        batchBonus: 45,
        seederMultiplier: 8,
        trustedBonus: 12,
        remakePenalty: -20,
      }),
    );
    expect(res.status).toBe(200);

    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    const row = rows.find((r) => r.targetId === 'matcher-weights');
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toEqual([
      'batchBonus',
      'groupStepDown',
      'groupTopWeight',
      'remakePenalty',
      'seederMultiplier',
      'trustedBonus',
    ]);
  });
});

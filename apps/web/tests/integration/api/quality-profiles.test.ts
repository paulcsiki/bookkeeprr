import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { GET } from '@/app/api/quality-profiles/route';
import { POST as SET_DEFAULT } from '@/app/api/quality-profiles/[id]/default/route';
import { insertQualityProfile } from '@/server/db/quality-profiles';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { expectShape } from '../../helpers/assert-spec';
import {
  MessageResponse,
  QualityProfileRow,
  QualityProfilesListResponse,
} from '@/server/openapi/schemas/quality-profiles';

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

function defaultReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/quality-profiles/x/default', {
    method: 'POST',
    headers,
  });
}

describe('GET /api/quality-profiles', () => {
  it('returns the profiles array directly (not wrapped)', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const rows = await expectShape(QualityProfilesListResponse, res, 'GET /api/quality-profiles');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.id).toBe(h.qpId);
  });
});

describe('POST /api/quality-profiles/[id]/default', () => {
  it('returns 401 with no cookie', async () => {
    const res = await SET_DEFAULT(defaultReq(null), {
      params: Promise.resolve({ id: String(h.qpId) }),
    });
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/quality-profiles/{id}/default');
  });

  it('returns 400 on non-numeric id', async () => {
    const res = await SET_DEFAULT(defaultReq(await adminCookie()), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    await expectShape(MessageResponse, res, 'POST /api/quality-profiles/{id}/default');
  });

  it('returns 404 when id not found', async () => {
    const res = await SET_DEFAULT(defaultReq(await adminCookie()), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(res.status).toBe(404);
    await expectShape(MessageResponse, res, 'POST /api/quality-profiles/{id}/default');
  });

  it('returns the updated row and moves the default flag', async () => {
    const otherId = await insertQualityProfile({ name: 'Other' });
    const res = await SET_DEFAULT(defaultReq(await adminCookie()), {
      params: Promise.resolve({ id: String(otherId) }),
    });
    expect(res.status).toBe(200);
    const row = await expectShape(
      QualityProfileRow,
      res,
      'POST /api/quality-profiles/{id}/default',
    );
    expect(row.id).toBe(otherId);
    expect(row.isDefault).toBe(true);
  });
});

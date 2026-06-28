import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET } from '@/app/api/auth/oidc/callback/route';

describe('GET /api/auth/oidc/callback — no pending cookie', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('returns 400 when bookkeeprr_oidc_pending cookie is missing', async () => {
    const req = new Request('http://localhost:3000/api/auth/oidc/callback?code=abc&state=x');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

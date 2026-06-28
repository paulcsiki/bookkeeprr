import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET } from '@/app/api/auth/oidc/callback/route';
import { signOidcPendingCookie } from '@/server/auth/oidc/state-cookie';
import { __resetDiscoveryCacheForTests } from '@/server/auth/oidc/discovery';

describe('GET /api/auth/oidc/callback — state mismatch', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
    vi.restoreAllMocks();
    __resetDiscoveryCacheForTests();
  });
  afterEach(() => h.cleanup());

  it('returns 400 when state query param does not match cookie state', async () => {
    const pending = await signOidcPendingCookie({
      codeVerifier: 'v',
      state: 'expected',
      nonce: 'n',
      issuer: 'https://idp.example.com/',
      next: null,
    });
    const req = new Request('http://localhost:3000/api/auth/oidc/callback?code=abc&state=WRONG', {
      headers: { cookie: `bookkeeprr_oidc_pending=${pending}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

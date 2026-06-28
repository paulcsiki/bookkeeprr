import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as oidc from '@/server/auth/oidc/openid-client';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { POST } from '@/app/api/auth/oidc/test/route';
import { expectShape } from '../../../helpers/assert-spec';
import { OidcTestResponse } from '@/server/openapi/schemas/auth';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { oidcConfigSetting } from '@/server/db/settings/oidc';

const MASK = '••••••••';

function mockDiscoveryOk(): void {
  vi.spyOn(oidc, 'discovery').mockResolvedValue({
    serverMetadata: () => ({ issuer: 'https://idp.example.com/' }),
  } as never);
}

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

describe('POST /api/auth/oidc/test', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
    vi.restoreAllMocks();
  });
  afterEach(() => h.cleanup());

  it('returns 401 without a session', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/oidc/test', {
        method: 'POST',
        body: JSON.stringify({ issuer: 'https://x/', clientId: 'c', clientSecret: 's' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 + resolved endpoints when discovery succeeds', async () => {
    const cookie = await adminCookie();
    vi.spyOn(oidc, 'discovery').mockResolvedValue({
      serverMetadata: () => ({
        issuer: 'https://idp.example.com/',
        authorization_endpoint: 'https://idp.example.com/authorize',
        token_endpoint: 'https://idp.example.com/token',
        jwks_uri: 'https://idp.example.com/jwks',
      }),
    } as never);
    const res = await POST(
      new Request('http://localhost/api/auth/oidc/test', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          issuer: 'https://idp.example.com/',
          clientId: 'cid',
          clientSecret: 'sec',
        }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(OidcTestResponse, res, 'POST /api/auth/oidc/test');
    const body = (await res.json()) as { ok: boolean; issuer: string };
    expect(body.ok).toBe(true);
    expect(body.issuer).toBe('https://idp.example.com/');
  });

  it('returns 502 when discovery fails', async () => {
    const cookie = await adminCookie();
    vi.spyOn(oidc, 'discovery').mockRejectedValue(new Error('connect ECONNREFUSED'));
    const res = await POST(
      new Request('http://localhost/api/auth/oidc/test', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          issuer: 'https://broken.example.com/',
          clientId: 'c',
          clientSecret: 's',
        }),
      }),
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok: false; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('discovery_failed');
  });

  it('falls back to the stored client secret when the masked sentinel is sent', async () => {
    const cookie = await adminCookie();
    const stored = await oidcConfigSetting.get();
    await oidcConfigSetting.set({ ...stored, clientSecret: 'stored-secret' });
    const spy = vi.spyOn(oidc, 'discovery');
    mockDiscoveryOk();
    const res = await POST(
      new Request('http://localhost/api/auth/oidc/test', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ issuer: 'https://idp.example.com/', clientId: 'cid', clientSecret: MASK }),
      }),
    );
    expect(res.status).toBe(200);
    // 3rd arg to discovery is the client secret.
    expect(spy.mock.calls[0]?.[2]).toBe('stored-secret');
  });

  it('falls back to the stored client secret when the secret is absent', async () => {
    const cookie = await adminCookie();
    const stored = await oidcConfigSetting.get();
    await oidcConfigSetting.set({ ...stored, clientSecret: 'stored-secret' });
    const spy = vi.spyOn(oidc, 'discovery');
    mockDiscoveryOk();
    const res = await POST(
      new Request('http://localhost/api/auth/oidc/test', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ issuer: 'https://idp.example.com/', clientId: 'cid' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(spy.mock.calls[0]?.[2]).toBe('stored-secret');
  });

  it('400 when the secret is blank and none is stored', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      new Request('http://localhost/api/auth/oidc/test', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ issuer: 'https://idp.example.com/', clientId: 'cid', clientSecret: '' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

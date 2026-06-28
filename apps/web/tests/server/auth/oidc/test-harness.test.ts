import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as oidc from '@/server/auth/oidc/openid-client';
import { createTestIdp, mockOpenIdClient } from '@/server/auth/oidc/test-harness';

describe('OIDC test harness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates an ID token whose claims round-trip via openid-client', async () => {
    const harness = await createTestIdp({
      issuer: 'https://test-idp.local/',
      clientId: 'bookkeeprr-test',
    });
    mockOpenIdClient(harness);
    const config = await oidc.discovery(
      new URL('https://test-idp.local/'),
      'bookkeeprr-test',
      'secret',
    );
    const callback = new URL('https://app.local/cb?code=fake&state=abc');
    const tokens = await oidc.authorizationCodeGrant(config, callback, {
      pkceCodeVerifier: 'fake-verifier',
    });
    const claims = tokens.claims();
    expect(claims).not.toBeNull();
    expect(claims?.iss).toBe('https://test-idp.local/');
  });

  it('lets the test override claims for the next token issuance', async () => {
    const harness = await createTestIdp({
      issuer: 'https://test-idp.local/',
      clientId: 'bookkeeprr-test',
    });
    harness.setNextClaims({
      sub: 'oidc|alice',
      preferred_username: 'alice',
      email: 'alice@example.com',
      groups: ['bookkeeprr-users'],
    });
    mockOpenIdClient(harness);
    const config = await oidc.discovery(
      new URL('https://test-idp.local/'),
      'bookkeeprr-test',
      'secret',
    );
    const tokens = await oidc.authorizationCodeGrant(
      config,
      new URL('https://app.local/cb?code=x'),
      { pkceCodeVerifier: 'v' },
    );
    expect(tokens.claims()?.sub).toBe('oidc|alice');
    expect((tokens.claims() as Record<string, unknown>).preferred_username).toBe('alice');
    expect((tokens.claims() as Record<string, unknown>).groups).toEqual(['bookkeeprr-users']);
  });
});

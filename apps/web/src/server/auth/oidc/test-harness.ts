/* test-only helper — do NOT import from production code */

import type { Configuration, authorizationCodeGrant } from 'openid-client';
import * as oidc from './openid-client';
import { SignJWT, generateKeyPair, exportJWK, type CryptoKey } from 'jose';
import { vi } from 'vitest';

export type IdpClaims = {
  sub: string;
  preferred_username?: string;
  email?: string;
  groups?: string[];
  [k: string]: unknown;
};

export type TestIdp = {
  issuer: string;
  clientId: string;
  privateKey: CryptoKey;
  publicJwk: Awaited<ReturnType<typeof exportJWK>>;
  setNextClaims(c: IdpClaims): void;
  setNextNonce(n: string | undefined): void;
  issueIdToken(): Promise<string>;
};

export async function createTestIdp(opts: { issuer: string; clientId: string }): Promise<TestIdp> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-kid';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  let nextClaims: IdpClaims = { sub: 'default-sub' };
  let nextNonce: string | undefined = undefined;

  return {
    issuer: opts.issuer,
    clientId: opts.clientId,
    privateKey,
    publicJwk,
    setNextClaims(c) {
      nextClaims = c;
    },
    setNextNonce(n) {
      nextNonce = n;
    },
    async issueIdToken() {
      const now = Math.floor(Date.now() / 1000);
      const payload: Record<string, unknown> = {
        ...nextClaims,
        iat: now,
        exp: now + 300,
        aud: opts.clientId,
      };
      if (nextNonce !== undefined) payload.nonce = nextNonce;
      return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
        .setIssuer(opts.issuer)
        .sign(privateKey);
    },
  };
}

export function mockOpenIdClient(harness: TestIdp): void {
  vi.spyOn(oidc, 'discovery').mockImplementation(async () => {
    return {
      serverMetadata: () => ({
        issuer: harness.issuer,
        authorization_endpoint: `${harness.issuer}authorize`,
        token_endpoint: `${harness.issuer}token`,
        jwks_uri: `${harness.issuer}jwks`,
        supportsPKCE: () => true,
      }),
    } as unknown as Configuration;
  });

  vi.spyOn(oidc, 'buildAuthorizationUrl').mockImplementation((config, parameters) => {
    const meta = (config as unknown as Configuration).serverMetadata();
    const endpoint = meta.authorization_endpoint;
    if (endpoint === undefined) {
      throw new Error('mock authorization_endpoint missing');
    }
    const url = new URL(endpoint);
    const params = new URLSearchParams(parameters as URLSearchParams | Record<string, string>);
    if (!params.has('client_id')) {
      params.set('client_id', harness.clientId);
    }
    if (!params.has('response_type')) {
      params.set('response_type', 'code');
    }
    for (const [k, v] of params.entries()) {
      url.searchParams.append(k, v);
    }
    return url;
  });

  vi.spyOn(oidc, 'authorizationCodeGrant').mockImplementation(async () => {
    const idToken = await harness.issueIdToken();
    const decoded = JSON.parse(
      Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    return {
      access_token: 'fake-access-token',
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 300,
      claims: () => decoded,
    } as unknown as Awaited<ReturnType<typeof authorizationCodeGrant>>;
  });
}

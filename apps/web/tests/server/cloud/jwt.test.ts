import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importJWK, jwtVerify, decodeProtectedHeader } from 'jose';
import { loadOrCreateKeypair } from '@/server/cloud/key';
import { signTenantJWT, signRegistrationJWT } from '@/server/cloud/jwt';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bk-cloud-jwt-'));
});

describe('tenant JWT', () => {
  it('signTenantJWT returns a verifiable EdDSA JWT', async () => {
    const kp = await loadOrCreateKeypair(dir);
    const jwt = await signTenantJWT(dir, {
      iss: 'bookkeeprr.example',
      sub: '00000000-0000-0000-0000-000000000001',
    });
    const pub = await importJWK(kp.publicJwk, 'EdDSA');
    const { payload } = await jwtVerify(jwt, pub);
    expect(payload.iss).toBe('bookkeeprr.example');
    expect(payload.sub).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('signRegistrationJWT embeds the public JWK in the header', async () => {
    await loadOrCreateKeypair(dir);
    const jwt = await signRegistrationJWT(dir, {
      iss: 'bookkeeprr.example',
      sub: '00000000-0000-0000-0000-000000000001',
    });
    const hdr = decodeProtectedHeader(jwt);
    expect(hdr.jwk).toBeDefined();
    expect((hdr.jwk as { kty: string }).kty).toBe('OKP');
  });
});

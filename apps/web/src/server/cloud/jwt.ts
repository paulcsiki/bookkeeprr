import { importJWK, SignJWT } from 'jose';
import { loadOrCreateKeypair, type Keypair } from './key';

interface Claims {
  iss: string;
  sub: string;
}

const DEFAULT_TTL_SECONDS = 60;

/**
 * Sign a tenant JWT using an explicit keypair (instead of reading the current
 * one from disk). Used by the rotation flow, which needs to sign with the OLD
 * key while a NEW key is already on disk.
 */
export async function signTenantJWTWithKeypair(
  kp: Keypair,
  claims: Claims,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const key = await importJWK(kp.privateJwk, 'EdDSA');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'EdDSA', kid: kp.kid })
    .setIssuer(claims.iss)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

export async function signTenantJWT(
  configDir: string,
  claims: Claims,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const kp = await loadOrCreateKeypair(configDir);
  const key = await importJWK(kp.privateJwk, 'EdDSA');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'EdDSA', kid: kp.kid })
    .setIssuer(claims.iss)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

export async function signRegistrationJWT(
  configDir: string,
  claims: Claims,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const kp = await loadOrCreateKeypair(configDir);
  const key = await importJWK(kp.privateJwk, 'EdDSA');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'EdDSA', kid: kp.kid, jwk: kp.publicJwk })
    .setIssuer(claims.iss)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

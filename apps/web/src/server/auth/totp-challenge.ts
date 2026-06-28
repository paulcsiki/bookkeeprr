/**
 * Short-lived challenge tokens for the TOTP login step.
 *
 * When a user passes credential verification but has TOTP enabled,
 * the login route issues a challengeToken instead of a session.
 * The token is a HS256 JWT with a 5-minute TTL signed with BOOKKEEPRR_SESSION_SECRET.
 */

import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'bookkeeprr-totp-challenge';
const AUDIENCE = 'bookkeeprr-login';
const TTL_SECONDS = 5 * 60; // 5 minutes

function getSecret(): Uint8Array {
  const raw = process.env.BOOKKEEPRR_SESSION_SECRET;
  if (!raw) {
    throw new Error('[totp-challenge] BOOKKEEPRR_SESSION_SECRET is not set');
  }
  return new TextEncoder().encode(raw);
}

/**
 * Sign a TOTP challenge token for the given user.
 * The token is valid for 5 minutes and carries only the userId.
 */
export async function signChallengeToken(userId: number): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${TTL_SECONDS}s`)
    .setIssuedAt()
    .sign(getSecret());
}

/**
 * Verify a TOTP challenge token. Returns the userId, or null if the token
 * is invalid, expired, or signed with a different secret.
 */
export async function verifyChallengeToken(token: string): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const userId = payload['userId'];
    if (typeof userId !== 'number') return null;
    return { userId };
  } catch {
    return null;
  }
}

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readerSecretSetting } from '@/server/db/settings/reader';

/**
 * Short-lived, scoped auth tokens for EPUB sub-resource requests.
 *
 * `react-native-webview` only forwards the Authorization header to the MAIN
 * document, not to the linked CSS / <img> / font sub-resources the rendered
 * HTML triggers. Those must carry auth in the URL (`?token=`). Putting the
 * long-lived (~90-day) account bearer in a URL is the caveat we are removing:
 * URLs leak into logs, caches, and history. Instead we mint a STATELESS,
 * HMAC-signed token scoped to a single `{fileId, userId}` with a 1-hour TTL.
 *
 * Token format: `base64url(JSON(payload)) + '.' + base64url(HMAC_SHA256(payloadB64, secret))`
 * where payload is `{ f: fileId, u: userId, e: expEpochMs }`.
 *
 * The crypto is pure and testable with an injected secret (`signEpubToken` /
 * `verifyEpubTokenWithSecret`); the async wrappers (`mintEpubToken` /
 * `verifyEpubToken`) fetch the persistent secret from settings.
 */

/** 1 hour. */
export const EPUB_TOKEN_TTL_MS = 60 * 60 * 1000;

export type EpubTokenPayload = {
  /** fileId the token authorizes. */
  f: number;
  /** userId the token grants. */
  u: number;
  /** Expiry, epoch millis. */
  e: number;
};

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf as Buffer | string).toString('base64url');
}

function hmac(payloadB64: string, secret: Buffer): Buffer {
  return createHmac('sha256', secret).update(payloadB64).digest();
}

/** Sign a payload into a token string. Pure; secret injected. */
export function signEpubToken(payload: EpubTokenPayload, secret: Buffer): string {
  const payloadB64 = b64url(JSON.stringify(payload));
  const mac = hmac(payloadB64, secret);
  return `${payloadB64}.${mac.toString('base64url')}`;
}

/**
 * Verify a token against an expected fileId and the current time. Returns the
 * userId on success, or null if the token is malformed, has a bad signature,
 * is expired, or is scoped to a different fileId. Pure; secret injected.
 *
 * The HMAC comparison is constant-time (`crypto.timingSafeEqual`).
 */
export function verifyEpubTokenWithSecret(
  token: string,
  fileId: number,
  now: number,
  secret: Buffer,
): number | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;

  const payloadB64 = token.slice(0, dot);
  const macB64 = token.slice(dot + 1);
  if (payloadB64.length === 0 || macB64.length === 0) return null;

  // Constant-time HMAC compare. Length-mismatched buffers can't be compared by
  // timingSafeEqual, so bail (still constant w.r.t. the secret).
  const expected = hmac(payloadB64, secret);
  let given: Buffer;
  try {
    given = Buffer.from(macB64, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;

  let payload: EpubTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    payload === null ||
    typeof payload !== 'object' ||
    typeof payload.f !== 'number' ||
    typeof payload.u !== 'number' ||
    typeof payload.e !== 'number'
  ) {
    return null;
  }

  if (payload.e <= now) return null;
  if (payload.f !== fileId) return null;
  return payload.u;
}

/**
 * Get-or-create the persistent 32-byte HMAC secret. Reads settings key
 * `reader.epub_token_secret`; if absent, generates 32 random bytes, persists
 * them (base64url), and returns the Buffer.
 */
export async function getEpubTokenSecret(): Promise<Buffer> {
  const cfg = await readerSecretSetting.get();
  if (cfg.epubTokenSecret !== null && cfg.epubTokenSecret.length > 0) {
    return Buffer.from(cfg.epubTokenSecret, 'base64url');
  }
  const secret = randomBytes(32);
  await readerSecretSetting.set({ epubTokenSecret: secret.toString('base64url') });
  return secret;
}

/**
 * Mint a token scoped to `{fileId, userId}`, expiring `EPUB_TOKEN_TTL_MS` after
 * `now`. Async because it fetches the persistent secret.
 */
export async function mintEpubToken(
  fileId: number,
  userId: number,
  now: number,
): Promise<string> {
  const secret = await getEpubTokenSecret();
  return signEpubToken({ f: fileId, u: userId, e: now + EPUB_TOKEN_TTL_MS }, secret);
}

/**
 * Verify a scoped token for `fileId` at `now`. Returns the userId or null.
 * Async because it fetches the persistent secret.
 */
export async function verifyEpubToken(
  token: string,
  fileId: number,
  now: number,
): Promise<number | null> {
  const secret = await getEpubTokenSecret();
  return verifyEpubTokenWithSecret(token, fileId, now, secret);
}

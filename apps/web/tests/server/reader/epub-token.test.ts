import { describe, expect, it } from 'vitest';
import { signEpubToken, verifyEpubTokenWithSecret } from '@/server/reader/epub-token';

// A fixed secret so the crypto is fully deterministic and DB-free.
const SECRET = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
const HOUR = 60 * 60 * 1000;

describe('epub scoped token crypto', () => {
  it('mint + verify round-trips: same fileId returns the userId', () => {
    const now = 1_000_000;
    const token = signEpubToken({ f: 42, u: 7, e: now + HOUR }, SECRET);
    expect(verifyEpubTokenWithSecret(token, 42, now, SECRET)).toBe(7);
  });

  it('returns null when verified against a different fileId', () => {
    const now = 1_000_000;
    const token = signEpubToken({ f: 42, u: 7, e: now + HOUR }, SECRET);
    expect(verifyEpubTokenWithSecret(token, 43, now, SECRET)).toBeNull();
  });

  it('returns null once the token has expired (now past exp)', () => {
    const exp = 1_000_000;
    const token = signEpubToken({ f: 42, u: 7, e: exp }, SECRET);
    // now === exp is NOT valid (we require exp > now); past exp is also invalid.
    expect(verifyEpubTokenWithSecret(token, 42, exp, SECRET)).toBeNull();
    expect(verifyEpubTokenWithSecret(token, 42, exp + 1, SECRET)).toBeNull();
  });

  it('still valid just before expiry', () => {
    const exp = 1_000_000;
    const token = signEpubToken({ f: 42, u: 7, e: exp }, SECRET);
    expect(verifyEpubTokenWithSecret(token, 42, exp - 1, SECRET)).toBe(7);
  });

  it('returns null when the HMAC signature is tampered', () => {
    const now = 1_000_000;
    const token = signEpubToken({ f: 42, u: 7, e: now + HOUR }, SECRET);
    const [payloadB64] = token.split('.');
    const tampered = `${payloadB64}.${Buffer.from('not-the-real-mac').toString('base64url')}`;
    expect(verifyEpubTokenWithSecret(tampered, 42, now, SECRET)).toBeNull();
  });

  it('returns null when the payload is tampered (signature no longer matches)', () => {
    const now = 1_000_000;
    const token = signEpubToken({ f: 42, u: 7, e: now + HOUR }, SECRET);
    const [, macB64] = token.split('.');
    // Swap in a different payload (escalate userId) while keeping the old MAC.
    const forged = Buffer.from(JSON.stringify({ f: 42, u: 999, e: now + HOUR })).toString(
      'base64url',
    );
    const tampered = `${forged}.${macB64}`;
    expect(verifyEpubTokenWithSecret(tampered, 42, now, SECRET)).toBeNull();
  });

  it('returns null when verified with a different secret', () => {
    const now = 1_000_000;
    const token = signEpubToken({ f: 42, u: 7, e: now + HOUR }, SECRET);
    const otherSecret = Buffer.from('ffffffffffffffffffffffffffffffff', 'utf8');
    expect(verifyEpubTokenWithSecret(token, 42, now, otherSecret)).toBeNull();
  });

  it('returns null on garbage / malformed input', () => {
    const now = 1_000_000;
    expect(verifyEpubTokenWithSecret('', 42, now, SECRET)).toBeNull();
    expect(verifyEpubTokenWithSecret('not-a-real-token', 42, now, SECRET)).toBeNull();
    expect(verifyEpubTokenWithSecret('a.b.c', 42, now, SECRET)).toBeNull();
    expect(verifyEpubTokenWithSecret('only-one-part', 42, now, SECRET)).toBeNull();
  });
});

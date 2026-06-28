import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import {
  encryptSecret,
  decryptSecret,
  generateSecret,
  generateOtpauthUri,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from '@/server/auth/totp';

// ─── Encrypt / decrypt ────────────────────────────────────────────────────────

describe('encryptSecret / decryptSecret (no env key)', () => {
  beforeEach(() => {
    delete process.env.BOOKKEEPRR_TOTP_ENC_KEY;
  });

  it('round-trips without encryption when env key is unset', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it('returns plaintext unchanged when env key is unset', () => {
    const plaintext = 'mysecretbase32value';
    expect(encryptSecret(plaintext)).toBe(plaintext);
  });
});

describe('encryptSecret / decryptSecret (with env key)', () => {
  const TEST_KEY = Buffer.from('01234567890123456789012345678901').toString('base64');

  beforeEach(() => {
    process.env.BOOKKEEPRR_TOTP_ENC_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.BOOKKEEPRR_TOTP_ENC_KEY;
  });

  it('encrypts to a different value than plaintext', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    // Should have 3 dot-separated base64url segments
    expect(encrypted.split('.').length).toBe(3);
  });

  it('round-trips correctly', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a).not.toBe(b);
  });

  it('decryptSecret falls back to plaintext for non-encrypted values', () => {
    // A value that doesn't look like our format (no dots) should pass through.
    expect(decryptSecret('RAW_BASE32_SECRET')).toBe('RAW_BASE32_SECRET');
  });
});

// ─── Secret generation ────────────────────────────────────────────────────────

describe('generateSecret', () => {
  it('returns a non-empty base32 string', () => {
    const secret = generateSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
    // Base32 uses A-Z and 2-7
    expect(/^[A-Z2-7]+=*$/.test(secret)).toBe(true);
  });

  it('produces different secrets on each call', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });
});

// ─── otpauth URI ─────────────────────────────────────────────────────────────

describe('generateOtpauthUri', () => {
  it('returns an otpauth:// URI', () => {
    const secret = generateSecret();
    const uri = generateOtpauthUri(secret, 'alice');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
  });

  it('includes the issuer and secret', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = generateOtpauthUri(secret, 'alice');
    expect(uri).toContain('issuer=bookkeeprr');
    expect(uri).toContain(`secret=${secret}`);
  });
});

// ─── TOTP verification ────────────────────────────────────────────────────────

describe('verifyTotpCode', () => {
  it('accepts the current code', () => {
    const secret = generateSecret();
    const totp = new TOTP({
      secret: Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    const code = totp.generate();
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = generateSecret();
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });

  it('rejects an obviously invalid code', () => {
    const secret = generateSecret();
    expect(verifyTotpCode(secret, 'notacode')).toBe(false);
  });

  it('accepts a code from one period ago (window=1)', () => {
    const secret = generateSecret();
    // Generate a code at timestamp - 30s
    const pastTimestamp = Date.now() - 30_000;
    const totp = new TOTP({
      secret: Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    const pastCode = totp.generate({ timestamp: pastTimestamp });
    // verifyTotpCode allows window=1, so this should pass
    expect(verifyTotpCode(secret, pastCode)).toBe(true);
  });
});

// ─── Recovery codes ───────────────────────────────────────────────────────────

describe('generateRecoveryCodes', () => {
  it('generates exactly 10 codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes.length).toBe(10);
  });

  it('each code has the xxxx-xxxx-xxxx format', () => {
    const codes = generateRecoveryCodes();
    for (const code of codes) {
      expect(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)).toBe(true);
    }
  });

  it('generates unique codes', () => {
    const codes = generateRecoveryCodes();
    const set = new Set(codes);
    expect(set.size).toBe(10);
  });

  it('no code contains ambiguous characters (0/O/1/I)', () => {
    const codes = generateRecoveryCodes();
    for (const code of codes) {
      expect(/[01IO]/.test(code)).toBe(false);
    }
  });
});

describe('hashRecoveryCode', () => {
  it('returns a 64-char hex string', () => {
    const h = hashRecoveryCode('ABCD-EFGH-JKLM');
    expect(h.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(h)).toBe(true);
  });

  it('is deterministic', () => {
    expect(hashRecoveryCode('ABCD-EFGH-JKLM')).toBe(hashRecoveryCode('ABCD-EFGH-JKLM'));
  });

  it('normalizes dashes and case before hashing', () => {
    expect(hashRecoveryCode('abcd-efgh-jklm')).toBe(hashRecoveryCode('ABCD-EFGH-JKLM'));
  });
});

describe('verifyRecoveryCode', () => {
  it('matches a valid code and removes it', () => {
    const codes = generateRecoveryCodes();
    const hashed = codes.map(hashRecoveryCode);
    const input = codes[3]!;

    const result = verifyRecoveryCode(input, hashed);
    expect(result.matched).toBe(true);
    expect(result.remaining.length).toBe(9);
    // The consumed hash should not appear in remaining
    expect(result.remaining.includes(hashRecoveryCode(input))).toBe(false);
  });

  it('rejects an unknown code', () => {
    const codes = generateRecoveryCodes();
    const hashed = codes.map(hashRecoveryCode);
    const result = verifyRecoveryCode('XXXX-XXXX-XXXX', hashed);
    expect(result.matched).toBe(false);
    expect(result.remaining.length).toBe(10);
  });

  it('a code cannot be used twice (single-use)', () => {
    const codes = generateRecoveryCodes();
    let hashed = codes.map(hashRecoveryCode);
    const code = codes[0]!;

    const first = verifyRecoveryCode(code, hashed);
    expect(first.matched).toBe(true);

    // Use the reduced list for the second attempt
    hashed = first.remaining;
    const second = verifyRecoveryCode(code, hashed);
    expect(second.matched).toBe(false);
  });
});

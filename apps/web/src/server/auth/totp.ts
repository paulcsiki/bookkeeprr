/**
 * TOTP crypto helpers for 2FA (DS11b-3).
 *
 * Encryption format: <base64url(iv)>.<base64url(ciphertext)>.<base64url(authTag)>
 * using AES-256-GCM with a 32-byte key sourced from BOOKKEEPRR_TOTP_ENC_KEY (base64).
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';

// ─── Key management ──────────────────────────────────────────────────────────

let _warnedMissingKey = false;

function getEncKey(): Buffer | null {
  const raw = process.env.BOOKKEEPRR_TOTP_ENC_KEY;
  if (!raw) {
    if (!_warnedMissingKey) {
      console.warn(
        '[totp] BOOKKEEPRR_TOTP_ENC_KEY is not set — TOTP secrets will be stored in plaintext. ' +
          'Set a 32-byte base64 key to enable at-rest encryption.',
      );
      _warnedMissingKey = true;
    }
    return null;
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    console.warn(
      `[totp] BOOKKEEPRR_TOTP_ENC_KEY decoded to ${buf.length} bytes; expected 32. Falling back to plaintext.`,
    );
    return null;
  }
  return buf;
}

// ─── Encrypt / decrypt ───────────────────────────────────────────────────────

/**
 * Encrypt a plaintext TOTP secret using AES-256-GCM.
 * Falls back to returning the plaintext unchanged if the env key is unset.
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncKey();
  if (key === null) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    authTag.toString('base64url'),
  ].join('.');
}

/**
 * Decrypt an AES-256-GCM encrypted TOTP secret.
 * Falls back to returning the value unchanged if the env key is unset.
 */
export function decryptSecret(encrypted: string): string {
  const key = getEncKey();
  if (key === null) return encrypted;

  // If value doesn't look like our encrypted format, treat as plaintext
  // (backward-compat for rows written before the env key was configured).
  const parts = encrypted.split('.');
  if (parts.length !== 3) return encrypted;

  const [ivB64, ctB64, tagB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, 'base64url');
  const ciphertext = Buffer.from(ctB64, 'base64url');
  const authTag = Buffer.from(tagB64, 'base64url');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// ─── Secret generation ───────────────────────────────────────────────────────

/**
 * Generate a random 32-byte TOTP secret and return its base32 representation.
 */
export function generateSecret(): string {
  const secret = new Secret({ size: 32 });
  return secret.base32;
}

/**
 * Build an otpauth:// URI for QR code generation.
 */
export function generateOtpauthUri(secret: string, username: string): string {
  const totp = new TOTP({
    issuer: 'bookkeeprr',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.toString();
}

// ─── TOTP verification ───────────────────────────────────────────────────────

/**
 * Verify a 6-digit TOTP code against the given base32 secret.
 * Allows a window of ±1 period (30s tolerance).
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  const delta = TOTP.validate({
    token: code,
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    window: 1,
  });
  return delta !== null;
}

// ─── Recovery codes ──────────────────────────────────────────────────────────

const RECOVERY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/**
 * Generate 10 single-use recovery codes in `xxxx-xxxx-xxxx` format.
 * Characters are chosen from an unambiguous set (no 0/O/1/I).
 */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const bytes = randomBytes(12);
    let code = '';
    for (let j = 0; j < 12; j++) {
      code += RECOVERY_CODE_CHARS[bytes[j]! % RECOVERY_CODE_CHARS.length];
    }
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`);
  }
  return codes;
}

/**
 * Hash a recovery code with SHA-256 (hex).
 */
export function hashRecoveryCode(code: string): string {
  // Normalize: strip dashes, uppercase
  const normalized = code.replace(/-/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Verify an input code against an array of hashed recovery codes.
 * If matched, returns the remaining codes (the matched entry removed).
 * Single-use: the matched hash is consumed on success.
 */
export function verifyRecoveryCode(
  input: string,
  hashedCodes: string[],
): { matched: boolean; remaining: string[] } {
  const inputHash = hashRecoveryCode(input);
  const idx = hashedCodes.findIndex((h) => h === inputHash);
  if (idx === -1) {
    return { matched: false, remaining: hashedCodes };
  }
  const remaining = [...hashedCodes.slice(0, idx), ...hashedCodes.slice(idx + 1)];
  return { matched: true, remaining };
}

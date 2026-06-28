import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '@/server/auth/password';

describe('hashPassword', () => {
  it('produces an argon2id PHC string', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h.startsWith('$argon2id$')).toBe(true);
  });

  it('produces different hashes for the same password (salt randomness)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const h = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', h)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const h = await hashPassword('correct horse');
    expect(await verifyPassword('wrong', h)).toBe(false);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    expect(await verifyPassword('any', 'not-a-real-hash')).toBe(false);
  });
});

describe('validatePasswordPolicy', () => {
  it('accepts 8+ char passwords', () => {
    expect(validatePasswordPolicy('12345678')).toEqual({ ok: true });
  });

  it('rejects shorter than 8', () => {
    const r = validatePasswordPolicy('short');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/at least 8/);
  });

  it('rejects empty string', () => {
    const r = validatePasswordPolicy('');
    expect(r.ok).toBe(false);
  });

  it('rejects non-string input', () => {
    const r = validatePasswordPolicy(undefined as unknown as string);
    expect(r.ok).toBe(false);
  });
});

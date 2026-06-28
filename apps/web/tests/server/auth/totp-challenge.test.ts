import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signChallengeToken, verifyChallengeToken } from '@/server/auth/totp-challenge';

const TEST_SECRET = 'test-session-secret-at-least-32-chars-long';

describe('signChallengeToken / verifyChallengeToken', () => {
  beforeEach(() => {
    process.env.BOOKKEEPRR_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.BOOKKEEPRR_SESSION_SECRET;
  });

  it('round-trips: verify returns the userId that was signed', async () => {
    const token = await signChallengeToken(42);
    const result = await verifyChallengeToken(token);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(42);
  });

  it('returns null for a tampered token', async () => {
    const token = await signChallengeToken(1);
    const [h, _p, sig] = token.split('.');
    // Corrupt the payload
    const tampered = `${h}.corrupted.${sig}`;
    expect(await verifyChallengeToken(tampered)).toBeNull();
  });

  it('returns null for a garbage string', async () => {
    expect(await verifyChallengeToken('not.a.jwt')).toBeNull();
  });

  it('tokens for different userIds are different', async () => {
    const a = await signChallengeToken(1);
    const b = await signChallengeToken(2);
    expect(a).not.toBe(b);
  });

  it('throws when BOOKKEEPRR_SESSION_SECRET is missing', async () => {
    delete process.env.BOOKKEEPRR_SESSION_SECRET;
    await expect(signChallengeToken(1)).rejects.toThrow('BOOKKEEPRR_SESSION_SECRET');
  });
});

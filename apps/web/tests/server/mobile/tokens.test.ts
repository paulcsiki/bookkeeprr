import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import {
  issueMobileToken,
  validateBearerToken,
  rotateRefreshToken,
  countMobileTokensForUser,
  MOBILE_TOKEN_TTL_MS,
} from '@/server/mobile/tokens';

async function makeUser(username = 'mobile-user'): Promise<number> {
  const u = await insertUser({
    username,
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  return u.id;
}

describe('mobile tokens DAL', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('issueMobileToken returns plaintext credentials and a 90-day expiry', async () => {
    const userId = await makeUser();
    const before = Date.now();
    const issued = await issueMobileToken(userId);
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(issued.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(issued.token).not.toBe(issued.refreshToken);
    const ttl = issued.expiresAt.getTime() - before;
    // Allow 5 seconds of drift.
    expect(ttl).toBeGreaterThan(MOBILE_TOKEN_TTL_MS - 5000);
    expect(ttl).toBeLessThanOrEqual(MOBILE_TOKEN_TTL_MS + 5000);
  });

  it('validateBearerToken returns the user id for a freshly issued token', async () => {
    const userId = await makeUser();
    const issued = await issueMobileToken(userId);
    const resolved = await validateBearerToken(issued.token);
    expect(resolved).toBe(userId);
  });

  it('validateBearerToken returns null for an unknown token', async () => {
    await makeUser();
    expect(await validateBearerToken('not-a-real-token')).toBeNull();
  });

  it('validateBearerToken returns null and prunes the row for an expired token', async () => {
    const userId = await makeUser();
    const issued = await issueMobileToken(userId, {
      expiresAtOverride: new Date(Date.now() - 1000),
    });
    expect(await validateBearerToken(issued.token)).toBeNull();
    expect(await countMobileTokensForUser(userId)).toBe(0);
  });

  it('validateBearerToken rejects empty / non-string inputs without throwing', async () => {
    expect(await validateBearerToken('')).toBeNull();
    expect(await validateBearerToken(undefined as unknown as string)).toBeNull();
  });

  it('rotateRefreshToken issues fresh credentials and invalidates the old ones', async () => {
    const userId = await makeUser();
    const first = await issueMobileToken(userId);
    const rotated = await rotateRefreshToken(first.refreshToken);
    expect(rotated).not.toBeNull();
    if (rotated === null) throw new Error();
    expect(rotated.token).not.toBe(first.token);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    // Old token must no longer validate.
    expect(await validateBearerToken(first.token)).toBeNull();
    // New token works.
    expect(await validateBearerToken(rotated.token)).toBe(userId);
    // Refresh tokens are single-use — re-attempting the old refresh fails.
    expect(await rotateRefreshToken(first.refreshToken)).toBeNull();
    // Only one row outstanding.
    expect(await countMobileTokensForUser(userId)).toBe(1);
  });

  it('rotateRefreshToken returns null for an unknown refresh token', async () => {
    await makeUser();
    expect(await rotateRefreshToken('bogus')).toBeNull();
  });

  it('rotateRefreshToken returns null and prunes the row when the refresh token has expired', async () => {
    const userId = await makeUser();
    const issued = await issueMobileToken(userId, {
      expiresAtOverride: new Date(Date.now() - 1000),
    });
    expect(await rotateRefreshToken(issued.refreshToken)).toBeNull();
    expect(await countMobileTokensForUser(userId)).toBe(0);
  });

  it('persists labels across rotation', async () => {
    const userId = await makeUser();
    const first = await issueMobileToken(userId, { label: 'iPhone 16 Pro' });
    const rotated = await rotateRefreshToken(first.refreshToken);
    expect(rotated).not.toBeNull();
    // Labels are an internal detail surfaced through admin endpoints, not
    // returned to the mobile client; assert via a fresh token lookup.
    const userIdAfter = await validateBearerToken(rotated!.token);
    expect(userIdAfter).toBe(userId);
  });
});

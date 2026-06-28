import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { mobileTokens } from '@/server/db/schema';
import { withWriteLock } from '@/server/db/write-lock';

/** 90 days, matching the spec. */
export const MOBILE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type IssuedToken = {
  /** Plaintext bearer token. Only returned to the caller once. */
  token: string;
  /** Plaintext refresh token. Only returned to the caller once. */
  refreshToken: string;
  expiresAt: Date;
};

function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type IssueMobileTokenOpts = {
  label?: string | null;
  ttlMs?: number;
  /** Test-only: deterministic expiry. */
  expiresAtOverride?: Date;
};

export async function issueMobileToken(
  userId: number,
  opts: IssueMobileTokenOpts = {},
): Promise<IssuedToken> {
  const token = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();
  const now = new Date();
  const expiresAt =
    opts.expiresAtOverride ?? new Date(now.getTime() + (opts.ttlMs ?? MOBILE_TOKEN_TTL_MS));
  await withWriteLock(async () => {
    await getDb()
      .insert(mobileTokens)
      .values({
        userId,
        tokenHash: hashToken(token),
        refreshTokenHash: hashToken(refreshToken),
        expiresAt,
        createdAt: now,
        lastUsedAt: null,
        label: opts.label ?? null,
      });
  });
  return { token, refreshToken, expiresAt };
}

/**
 * Resolve a bearer token to its owning user id. Returns `null` for unknown,
 * expired, or malformed tokens.
 *
 * Updates `last_used_at` opportunistically on a hit (best-effort, no error
 * if the update races a delete).
 */
export async function validateBearerToken(token: string): Promise<number | null> {
  if (typeof token !== 'string' || token.length === 0) return null;
  const tokenHash = hashToken(token);
  const rows = await getDb()
    .select()
    .from(mobileTokens)
    .where(eq(mobileTokens.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  if (row.expiresAt <= new Date()) {
    // Expired — opportunistically prune.
    await withWriteLock(async () => {
      await getDb().delete(mobileTokens).where(eq(mobileTokens.id, row.id));
    });
    return null;
  }
  await withWriteLock(async () => {
    await getDb()
      .update(mobileTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(mobileTokens.id, row.id));
  });
  return row.userId;
}

/**
 * Exchange a refresh token for a fresh token + refresh-token pair. The old
 * row is deleted (refresh tokens are single-use). Returns `null` when the
 * refresh token is unknown or expired.
 */
export async function rotateRefreshToken(refreshToken: string): Promise<IssuedToken | null> {
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return null;
  const refreshHash = hashToken(refreshToken);
  const rows = await getDb()
    .select()
    .from(mobileTokens)
    .where(eq(mobileTokens.refreshTokenHash, refreshHash))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  if (row.expiresAt <= new Date()) {
    await withWriteLock(async () => {
      await getDb().delete(mobileTokens).where(eq(mobileTokens.id, row.id));
    });
    return null;
  }
  // Delete the old row, then issue fresh credentials carrying the same label.
  await withWriteLock(async () => {
    await getDb().delete(mobileTokens).where(eq(mobileTokens.id, row.id));
  });
  return issueMobileToken(row.userId, { label: row.label });
}

/** Test/admin helper: count outstanding tokens for a user. */
export async function countMobileTokensForUser(userId: number): Promise<number> {
  const rows = await getDb()
    .select({ id: mobileTokens.id })
    .from(mobileTokens)
    .where(eq(mobileTokens.userId, userId));
  return rows.length;
}

/** Test/admin helper: delete all mobile tokens for a user (logout-all). */
export async function deleteAllMobileTokensForUser(userId: number): Promise<void> {
  await withWriteLock(async () => {
    await getDb().delete(mobileTokens).where(eq(mobileTokens.userId, userId));
  });
}

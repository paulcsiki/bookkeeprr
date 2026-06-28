import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { mobileExchangeCodes } from '@/server/db/schema';
import { withWriteLock } from '@/server/db/write-lock';

/** Spec: 60-second TTL. */
export const EXCHANGE_CODE_TTL_MS = 60 * 1000;

function generateCode(): string {
  return randomBytes(32).toString('base64url');
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export type CreateExchangeCodeOpts = {
  ttlMs?: number;
  /** Test-only deterministic expiry. */
  expiresAtOverride?: Date;
};

/**
 * Create a short-lived exchange code bound to `userId`. Returns the plaintext
 * code (only the sha256 hash is persisted). The login flow embeds the
 * plaintext code in the `?exchange=…` query parameter on the
 * `bookkeeprr://` redirect; the mobile client immediately trades it for a
 * bearer token via `/api/mobile/exchange`.
 */
export async function createExchangeCode(
  userId: number,
  opts: CreateExchangeCodeOpts = {},
): Promise<string> {
  const code = generateCode();
  const now = new Date();
  const expiresAt =
    opts.expiresAtOverride ?? new Date(now.getTime() + (opts.ttlMs ?? EXCHANGE_CODE_TTL_MS));
  await withWriteLock(async () => {
    await getDb()
      .insert(mobileExchangeCodes)
      .values({
        codeHash: hashCode(code),
        userId,
        expiresAt,
        createdAt: now,
      });
  });
  return code;
}

/**
 * Consume an exchange code. Returns the owning `userId` on success, `null`
 * otherwise. Codes are single-use — the row is deleted regardless of
 * whether the code was still valid (defense in depth against double-spend).
 */
export async function consumeExchangeCode(code: string): Promise<number | null> {
  if (typeof code !== 'string' || code.length === 0) return null;
  return withWriteLock(async () => {
    const codeHash = hashCode(code);
    const rows = await getDb()
      .select()
      .from(mobileExchangeCodes)
      .where(eq(mobileExchangeCodes.codeHash, codeHash))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    // Single-use: delete the row up-front so a duplicate consumeExchangeCode
    // call returns null even if the original was still in its TTL window.
    await getDb().delete(mobileExchangeCodes).where(eq(mobileExchangeCodes.id, row.id));
    if (row.expiresAt <= new Date()) return null;
    return row.userId;
  });
}

/** Best-effort cleanup of expired rows. Safe to call from any handler. */
export async function pruneExpiredExchangeCodes(): Promise<number> {
  return withWriteLock(async () => {
    const now = new Date();
    const before = await getDb()
      .select({ id: mobileExchangeCodes.id })
      .from(mobileExchangeCodes)
      .where(lt(mobileExchangeCodes.expiresAt, now));
    if (before.length === 0) return 0;
    await getDb().delete(mobileExchangeCodes).where(lt(mobileExchangeCodes.expiresAt, now));
    return before.length;
  });
}

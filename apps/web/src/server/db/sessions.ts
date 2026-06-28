import { and, desc, eq, lt, like, sql } from 'drizzle-orm';
import { getDb } from './client';
import { sessions, type SessionRow } from './schema';
import { withWriteLock } from './write-lock';
import { generateSessionToken } from '@/server/auth/session-token';

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_DEBOUNCE_MS = 60_000;

export type CreateSessionInput = {
  userId: number;
  userAgent: string | null;
  ipAddress: string | null;
  ttlMs?: number;
  expiresAtOverride?: Date; // test-only convenience
  lastSeenAtOverride?: Date; // test-only convenience
};

export async function createSession(input: CreateSessionInput): Promise<SessionRow> {
  return withWriteLock(async () => {
    const token = generateSessionToken();
    const now = new Date();
    const expiresAt =
      input.expiresAtOverride ?? new Date(now.getTime() + (input.ttlMs ?? DEFAULT_TTL_MS));
    const lastSeenAt = input.lastSeenAtOverride ?? now;
    const [row] = await getDb()
      .insert(sessions)
      .values({
        token,
        userId: input.userId,
        createdAt: now,
        expiresAt,
        lastSeenAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      })
      .returning();
    if (!row) throw new Error('createSession: insert returned no row');
    return row;
  });
}

export async function getSessionByToken(token: string): Promise<SessionRow | null> {
  const rows = await getDb().select().from(sessions).where(eq(sessions.token, token)).limit(1);
  return rows[0] ?? null;
}

export async function refreshSession(token: string): Promise<void> {
  const current = await getSessionByToken(token);
  if (current === null) return;
  const age = Date.now() - current.lastSeenAt.getTime();
  if (age < REFRESH_DEBOUNCE_MS) return;
  await withWriteLock(() =>
    getDb().update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.token, token)),
  );
}

export async function revokeSession(token: string): Promise<void> {
  await withWriteLock(() => getDb().delete(sessions).where(eq(sessions.token, token)));
}

export async function revokeAllSessionsForUser(userId: number): Promise<number> {
  return withWriteLock(async () => {
    const before = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    const count = Number(before[0]?.count ?? 0);
    await getDb().delete(sessions).where(eq(sessions.userId, userId));
    return count;
  });
}

export async function listSessionsForUser(userId: number): Promise<SessionRow[]> {
  return getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastSeenAt));
}

export async function revokeSessionByPrefix(
  userId: number,
  tokenPrefix: string,
): Promise<{ ok: true } | { error: 'not_found' | 'ambiguous' }> {
  return withWriteLock(async () => {
    const rows = await getDb()
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), like(sessions.token, `${tokenPrefix}%`)));
    if (rows.length === 0) return { error: 'not_found' };
    if (rows.length > 1) return { error: 'ambiguous' };
    await getDb().delete(sessions).where(eq(sessions.token, rows[0]!.token));
    return { ok: true };
  });
}

export async function pruneExpiredSessions(): Promise<number> {
  return withWriteLock(async () => {
    const now = new Date();
    const before = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(lt(sessions.expiresAt, now));
    const count = Number(before[0]?.count ?? 0);
    await getDb().delete(sessions).where(lt(sessions.expiresAt, now));
    return count;
  });
}

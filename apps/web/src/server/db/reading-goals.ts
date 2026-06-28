import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { readingGoals, type ReadingGoalsRow } from './schema';
import { withWriteLock } from './write-lock';

/** A user's reading goals; both targets null when nothing is set. */
export type ReadingGoals = {
  yearlyBooks: number | null;
  weeklyMinutes: number | null;
  streakDays: number | null;
};

const EMPTY_GOALS: ReadingGoals = { yearlyBooks: null, weeklyMinutes: null, streakDays: null };

/**
 * The current goals for a user. Returns nulls (no row) when the user has never
 * set a goal — callers render an empty ring in that case.
 */
export async function getGoals(userId: number): Promise<ReadingGoals> {
  const rows = await getDb()
    .select()
    .from(readingGoals)
    .where(eq(readingGoals.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return { ...EMPTY_GOALS };
  return {
    yearlyBooks: row.yearlyBooks,
    weeklyMinutes: row.weeklyMinutes,
    streakDays: row.streakDays,
  };
}

export type SetGoalsInput = {
  /** Yearly finished-books target; null clears it; undefined leaves it as-is. */
  yearlyBooks?: number | null;
  /** Weekly reading-minutes target; null clears it; undefined leaves it as-is. */
  weeklyMinutes?: number | null;
  /** Reading-streak target in days; null clears it; undefined leaves it as-is. */
  streakDays?: number | null;
};

/**
 * Upsert a user's goals. Only the supplied keys change; an explicit `null`
 * clears that goal, while `undefined` (omitted) preserves the existing value.
 * Returns the resulting goals.
 */
export async function setGoals(userId: number, input: SetGoalsInput): Promise<ReadingGoals> {
  return withWriteLock(async () => {
    const existing = await getDb()
      .select()
      .from(readingGoals)
      .where(eq(readingGoals.userId, userId))
      .limit(1);
    const prev: ReadingGoalsRow | undefined = existing[0];
    const next: ReadingGoals = {
      yearlyBooks:
        input.yearlyBooks !== undefined ? input.yearlyBooks : (prev?.yearlyBooks ?? null),
      weeklyMinutes:
        input.weeklyMinutes !== undefined ? input.weeklyMinutes : (prev?.weeklyMinutes ?? null),
      streakDays:
        input.streakDays !== undefined ? input.streakDays : (prev?.streakDays ?? null),
    };
    await getDb()
      .insert(readingGoals)
      .values({ userId, ...next, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: readingGoals.userId,
        set: { ...next, updatedAt: new Date() },
      });
    return next;
  });
}

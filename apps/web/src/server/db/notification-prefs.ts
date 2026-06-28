import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { userNotificationPreferences, type UserNotificationPreferencesRow } from './schema';
import { withWriteLock } from './write-lock';

const DEFAULTS = {
  eventGrabSuccess: true,
  eventImportSuccess: true,
  eventFailure: true,
  eventUpdateAvailable: false,
  channel: 'email' as const,
};

export async function getOrCreateNotificationPrefs(
  userId: number,
): Promise<UserNotificationPreferencesRow> {
  const rows = await getDb()
    .select()
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
    .limit(1);
  if (rows[0]) return rows[0];

  // Create with defaults.
  return withWriteLock(async () => {
    // Double-check after acquiring the lock.
    const existing = await getDb()
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId))
      .limit(1);
    if (existing[0]) return existing[0];

    const [row] = await getDb()
      .insert(userNotificationPreferences)
      .values({ userId, ...DEFAULTS })
      .returning();
    if (!row) throw new Error('getOrCreateNotificationPrefs: insert returned no row');
    return row;
  });
}

export type UpdateNotificationPrefsPatch = Partial<{
  eventGrabSuccess: boolean;
  eventImportSuccess: boolean;
  eventFailure: boolean;
  eventUpdateAvailable: boolean;
  channel: 'email' | 'push' | 'webhook';
}>;

export async function updateNotificationPrefs(
  userId: number,
  patch: UpdateNotificationPrefsPatch,
): Promise<UserNotificationPreferencesRow> {
  if (Object.keys(patch).length === 0) {
    return getOrCreateNotificationPrefs(userId);
  }
  // Ensure the row exists first.
  await getOrCreateNotificationPrefs(userId);
  return withWriteLock(async () => {
    const [row] = await getDb()
      .update(userNotificationPreferences)
      .set(patch)
      .where(eq(userNotificationPreferences.userId, userId))
      .returning();
    if (!row) throw new Error('updateNotificationPrefs: update returned no row');
    return row;
  });
}

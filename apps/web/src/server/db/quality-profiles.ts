import { asc, eq } from 'drizzle-orm';
import { getDb } from './client';
import { qualityProfiles, type QualityProfileRow } from './schema';
import { withWriteLock } from './write-lock';

export async function listQualityProfiles(): Promise<QualityProfileRow[]> {
  return getDb().select().from(qualityProfiles);
}

/**
 * Returns the quality profile flagged as default. If no profile is flagged but
 * at least one exists, lazily marks the lowest-id profile as default (in a
 * transaction) and returns it. Returns null only when there are zero profiles.
 */
export async function getDefaultQualityProfile(): Promise<QualityProfileRow | null> {
  const db = getDb();
  const existing = await db
    .select()
    .from(qualityProfiles)
    .where(eq(qualityProfiles.isDefault, true))
    .limit(1);
  if (existing[0]) return existing[0];

  return withWriteLock(() =>
    db.transaction((tx): QualityProfileRow | null => {
      // Re-check inside the transaction in case a concurrent writer set one.
      const already = tx
        .select()
        .from(qualityProfiles)
        .where(eq(qualityProfiles.isDefault, true))
        .limit(1)
        .all();
      if (already[0]) return already[0];

      const lowest = tx
        .select()
        .from(qualityProfiles)
        .orderBy(asc(qualityProfiles.id))
        .limit(1)
        .all();
      const profile = lowest[0];
      if (!profile) return null;

      tx.update(qualityProfiles)
        .set({ isDefault: true })
        .where(eq(qualityProfiles.id, profile.id))
        .run();
      return { ...profile, isDefault: true };
    }),
  );
}

/**
 * Makes `id` the single default profile: clears the flag on all rows then sets
 * it on `id`, atomically.
 */
export async function setDefaultQualityProfile(id: number): Promise<void> {
  const db = getDb();
  await withWriteLock(() =>
    db.transaction((tx) => {
      tx.update(qualityProfiles).set({ isDefault: false }).run();
      tx.update(qualityProfiles)
        .set({ isDefault: true })
        .where(eq(qualityProfiles.id, id))
        .run();
    }),
  );
}

export async function getQualityProfile(id: number): Promise<QualityProfileRow | null> {
  const rows = await getDb()
    .select()
    .from(qualityProfiles)
    .where(eq(qualityProfiles.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type QualityProfileCreate = {
  name: string;
  preferCompleteBatches?: boolean;
  preferredGroupsJson?: string;
  preferredLanguagesJson?: string;
  minSizeMb?: number | null;
  maxSizeMb?: number | null;
  preferOriginals?: boolean;
};

export async function insertQualityProfile(input: QualityProfileCreate): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(qualityProfiles)
      .values({
        name: input.name,
        preferCompleteBatches: input.preferCompleteBatches ?? false,
        preferredGroupsJson: input.preferredGroupsJson ?? '[]',
        preferredLanguagesJson: input.preferredLanguagesJson ?? '["en"]',
        minSizeMb: input.minSizeMb ?? null,
        maxSizeMb: input.maxSizeMb ?? null,
        preferOriginals: input.preferOriginals ?? false,
      })
      .returning({ id: qualityProfiles.id });
    if (!row) throw new Error('insertQualityProfile: insert returned no row');
    return row.id;
  });
}

export async function seedDefaultQualityProfile(): Promise<number> {
  const existing = await listQualityProfiles();
  if (existing.length > 0) return existing[0]!.id;
  return insertQualityProfile({ name: 'Default' });
}

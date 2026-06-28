import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { releases, type ReleaseRow } from './schema';
import { withWriteLock } from './write-lock';

export type ReleaseCreate = {
  seriesId?: number | null;
  indexerId: number;
  indexerGuid: string;
  title: string;
  link: string;
  targetKind: 'volume' | 'chapter' | 'batch';
  targetLow?: number | null;
  targetHigh?: number | null;
  groupName?: string | null;
  language?: string | null;
  sizeBytes: number;
  seeders?: number;
  leechers?: number;
  publishedAt: Date;
  score?: number | null;
  trusted?: boolean | null;
  remake?: boolean | null;
};

export async function insertRelease(input: ReleaseCreate): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(releases)
      .values({
        seriesId: input.seriesId ?? null,
        indexerId: input.indexerId,
        indexerGuid: input.indexerGuid,
        title: input.title,
        link: input.link,
        targetKind: input.targetKind,
        targetLow: input.targetLow ?? null,
        targetHigh: input.targetHigh ?? null,
        groupName: input.groupName ?? null,
        language: input.language ?? null,
        sizeBytes: input.sizeBytes,
        seeders: input.seeders ?? 0,
        leechers: input.leechers ?? 0,
        publishedAt: input.publishedAt,
        score: input.score ?? null,
        trusted: input.trusted ?? null,
        remake: input.remake ?? null,
      })
      .returning({ id: releases.id });
    if (!row) throw new Error('insertRelease: insert returned no row');
    return row.id;
  });
}

export async function getRelease(id: number): Promise<ReleaseRow | null> {
  const rows = await getDb().select().from(releases).where(eq(releases.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findReleaseByIndexerGuid(
  indexerId: number,
  indexerGuid: string,
): Promise<ReleaseRow | null> {
  const rows = await getDb()
    .select()
    .from(releases)
    .where(and(eq(releases.indexerId, indexerId), eq(releases.indexerGuid, indexerGuid)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertReleaseByGuid(input: ReleaseCreate): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(releases)
      .values({
        seriesId: input.seriesId ?? null,
        indexerId: input.indexerId,
        indexerGuid: input.indexerGuid,
        title: input.title,
        link: input.link,
        targetKind: input.targetKind,
        targetLow: input.targetLow ?? null,
        targetHigh: input.targetHigh ?? null,
        groupName: input.groupName ?? null,
        language: input.language ?? null,
        sizeBytes: input.sizeBytes,
        seeders: input.seeders ?? 0,
        leechers: input.leechers ?? 0,
        publishedAt: input.publishedAt,
        score: input.score ?? null,
        trusted: input.trusted ?? null,
        remake: input.remake ?? null,
      })
      .onConflictDoUpdate({
        target: [releases.indexerId, releases.indexerGuid],
        set: {
          title: input.title,
          link: input.link,
          seriesId: input.seriesId ?? null,
          targetKind: input.targetKind,
          targetLow: input.targetLow ?? null,
          targetHigh: input.targetHigh ?? null,
          groupName: input.groupName ?? null,
          language: input.language ?? null,
          sizeBytes: input.sizeBytes,
          seeders: input.seeders ?? 0,
          leechers: input.leechers ?? 0,
          publishedAt: input.publishedAt,
          score: input.score ?? null,
          trusted: input.trusted ?? null,
          remake: input.remake ?? null,
        },
      })
      .returning({ id: releases.id });
    if (!row) throw new Error('upsertReleaseByGuid: insert returned no row');
    return row.id;
  });
}

export async function listReleasesBySeries(seriesId: number, limit = 200): Promise<ReleaseRow[]> {
  return getDb()
    .select()
    .from(releases)
    .where(eq(releases.seriesId, seriesId))
    .orderBy(sql`${releases.score} DESC NULLS LAST`, desc(releases.publishedAt))
    .limit(limit);
}

export async function deleteRelease(id: number): Promise<void> {
  await withWriteLock(() => getDb().delete(releases).where(eq(releases.id, id)));
}

// Exponential backoff for repeatedly-failing grabs. Indexes by the number of
// consecutive failures already recorded; capped at the final entry. Keeps a
// broken indexer / dead torrent from being re-attempted (and re-notified) on
// every ~1-minute poll cycle.
const GRAB_BACKOFF_MS = [
  5 * 60_000, // 1st failure → wait 5m before retry
  20 * 60_000, // 2nd → 20m
  60 * 60_000, // 3rd → 1h
  4 * 60 * 60_000, // 4th → 4h
  12 * 60 * 60_000, // 5th+ → 12h
] as const;

/** Backoff window (ms) to wait after `attempts` consecutive grab failures. */
export function grabBackoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return GRAB_BACKOFF_MS[Math.min(attempts, GRAB_BACKOFF_MS.length) - 1]!;
}

/** True when a release's last grab failure is still inside its backoff window. */
export function isReleaseInGrabBackoff(release: ReleaseRow, now = Date.now()): boolean {
  if (release.grabFailedAt === null) return false;
  return now - release.grabFailedAt.getTime() < grabBackoffMs(release.grabAttempts);
}

/** Record a failed grab attempt: stamp the time and bump the consecutive count. */
export async function recordGrabFailure(id: number): Promise<void> {
  await withWriteLock(() =>
    getDb()
      .update(releases)
      .set({ grabFailedAt: new Date(), grabAttempts: sql`${releases.grabAttempts} + 1` })
      .where(eq(releases.id, id)),
  );
}

/**
 * Permanently blacklist a release. Once stamped, auto-grab excludes it and the
 * matcher returns `{matches:false, reason:'rejected'}` so it's never grabbed
 * again — auto-grab falls through to the next-best candidate. Preserved across
 * upserts (the columns are NOT in `upsertReleaseByGuid`'s onConflict set), so
 * re-discovering the same release can't resurrect it. No expiry, unlike backoff.
 */
export async function markReleaseRejected(id: number, reason: string): Promise<void> {
  await withWriteLock(() =>
    getDb()
      .update(releases)
      .set({ rejectedAt: new Date(), rejectionReason: reason })
      .where(eq(releases.id, id)),
  );
}

/** Clear grab-failure state after a successful (or already-satisfied) grab. */
export async function clearGrabFailure(id: number): Promise<void> {
  await withWriteLock(() =>
    getDb()
      .update(releases)
      .set({ grabFailedAt: null, grabAttempts: 0 })
      .where(eq(releases.id, id)),
  );
}

export type PruneParams = {
  keepPerSeries: number;
  olderThanDays: number;
};

export type PruneResult = { deletedCount: number };

export async function pruneReleases(params: PruneParams): Promise<PruneResult> {
  return withWriteLock(async () => {
    const cutoffMs = Date.now() - params.olderThanDays * 24 * 60 * 60 * 1000;
    const result = getDb().run(sql`
      DELETE FROM releases
      WHERE published_at < ${cutoffMs}
        AND id NOT IN (
          SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY series_id ORDER BY published_at DESC
                   ) AS rn
            FROM releases
          )
          WHERE rn <= ${params.keepPerSeries}
        )
        AND id NOT IN (
          SELECT release_id FROM downloads
        );
    `);
    return { deletedCount: result.changes ?? 0 };
  });
}

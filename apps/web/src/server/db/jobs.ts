import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from './client';
import { jobs, type JobRow } from './schema';
import { withWriteLock } from './write-lock';

export type JobKind = string;

export type RecordErrorOpts = {
  maxAttempts: number;
};

export async function enqueueJob<P>(
  kind: JobKind,
  payload: P,
  scheduledFor: Date = new Date(),
): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(jobs)
      .values({
        kind,
        payloadJson: JSON.stringify(payload),
        scheduledFor,
      })
      .returning({ id: jobs.id });
    if (!row) throw new Error('enqueueJob: insert returned no row');
    return row.id;
  });
}

export async function claimNextJob(kind: JobKind): Promise<JobRow | null> {
  const db = getDb();
  const sqlite = db.$client;
  const nowMs = Date.now();

  // Atomically find a pending job and mark it running using a synchronous
  // immediate transaction to prevent two concurrent callers claiming the same row.
  const claimedId = await withWriteLock(() =>
    sqlite
      .transaction((): number | null => {
        const candidate = sqlite
          .prepare(
            `SELECT id FROM jobs
           WHERE kind = ? AND status = 'pending' AND scheduled_for <= ?
           ORDER BY id LIMIT 1`,
          )
          .get(kind, nowMs) as { id: number } | undefined;
        if (!candidate) return null;
        sqlite
          .prepare(
            `UPDATE jobs SET status='running', started_at = ?, attempt = attempt + 1 WHERE id = ?`,
          )
          .run(nowMs, candidate.id);
        return candidate.id;
      })
      .immediate(),
  );

  if (claimedId === null) return null;

  // Fetch via Drizzle so we get camelCase-mapped fields.
  const [refreshed] = await db.select().from(jobs).where(eq(jobs.id, claimedId)).limit(1);
  return refreshed ?? null;
}

export async function recordJobResult<R>(id: number, result: R): Promise<void> {
  await withWriteLock(() =>
    getDb()
      .update(jobs)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        resultJson: JSON.stringify(result),
        error: null,
      })
      .where(eq(jobs.id, id)),
  );
}

export async function recordJobError(
  id: number,
  error: string,
  opts: RecordErrorOpts,
): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!row) throw new Error(`recordJobError: job ${id} not found`);
  const reachedLimit = row.attempt >= opts.maxAttempts;
  if (reachedLimit) {
    await withWriteLock(() =>
      db
        .update(jobs)
        .set({ status: 'failed', finishedAt: new Date(), error })
        .where(eq(jobs.id, id)),
    );
  } else {
    await withWriteLock(() =>
      db
        .update(jobs)
        .set({
          status: 'pending',
          startedAt: null,
          finishedAt: null,
          error,
          scheduledFor: new Date(
            Date.now() + Math.min(30_000 * Math.pow(2, row.attempt - 1), 3_600_000),
          ),
        })
        .where(eq(jobs.id, id)),
    );
  }
}

export async function countJobsByStatus(kind: JobKind): Promise<{
  pending: number;
  running: number;
  completed: number;
  failed: number;
  interrupted: number;
  cancelled: number;
}> {
  const rows = (await getDb()
    .select({ status: jobs.status, count: sql<number>`count(*)`.as('count') })
    .from(jobs)
    .where(eq(jobs.kind, kind))
    .groupBy(jobs.status)) as { status: JobRow['status']; count: number }[];

  const out = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    interrupted: 0,
    cancelled: 0,
  };
  for (const r of rows) out[r.status] = r.count;
  return out;
}

export async function listJobsByKind(kind: string): Promise<JobRow[]> {
  return getDb().select().from(jobs).where(eq(jobs.kind, kind));
}

/** Job kinds that hydrate a series' metadata from an external source. */
const HYDRATE_KINDS = ['metadata_hydrate', 'comicvine_hydrate', 'novel_updates_hydrate'] as const;

/**
 * Job kinds that do background work referencing a series by `seriesId` in their
 * payload. Drives the series-page activity indicator + empty-state copy.
 *
 * `import` is included for completeness; its payload keys on `downloadId`, not
 * `seriesId`, so it will only ever match if a future import payload carries a
 * `seriesId` — it never false-matches today.
 */
const SERIES_ACTIVITY_KINDS = [
  'metadata_hydrate',
  'comicvine_hydrate',
  'novel_updates_hydrate',
  'novel_updates_chapter_sync',
  'mangadex_chapter_sync',
  'mangadex_volume_hydrate',
  'series_release_search',
  'import',
] as const;

/**
 * Distinct kinds of pending/running jobs whose payload references `seriesId`,
 * across the series-activity kinds (metadata/comicvine/novel_updates hydrate,
 * chapter syncs, volume hydrate, import).
 *
 * Drives the series-page activity indicator + empty-state copy. We fetch the
 * small set of active (pending/running) jobs in those kinds via the indexed
 * kind+status query and match the parsed payload's `seriesId` in JS — robust
 * against JSON whitespace/key-order that a `payload_json LIKE` would miss, and
 * cheap because the active set is tiny. Returns distinct kinds (deduped),
 * order unspecified.
 */
export async function activeJobKindsForSeries(seriesId: number): Promise<string[]> {
  const rows = await getDb()
    .select({ kind: jobs.kind, payloadJson: jobs.payloadJson })
    .from(jobs)
    .where(
      and(
        inArray(jobs.kind, SERIES_ACTIVITY_KINDS as unknown as string[]),
        inArray(jobs.status, ['pending', 'running']),
      ),
    );
  const kinds = new Set<string>();
  for (const r of rows) {
    try {
      const payload = JSON.parse(r.payloadJson) as { seriesId?: unknown };
      if (payload?.seriesId === seriesId) kinds.add(r.kind);
    } catch {
      // Malformed payload — can't match; skip it.
    }
  }
  return [...kinds];
}

/**
 * True when a metadata-hydrate job for `seriesId` is still pending or running.
 *
 * Drives the "Fetching details…" indicator on the series page. Reimplemented on
 * top of {@link activeJobKindsForSeries}, narrowed to the hydrate kinds.
 */
export async function hasActiveHydrateJob(seriesId: number): Promise<boolean> {
  const kinds = await activeJobKindsForSeries(seriesId);
  return kinds.some((k) => (HYDRATE_KINDS as readonly string[]).includes(k));
}

/**
 * True when an `import` job for `downloadId` is still pending or running.
 *
 * Drives the qbt_watch enqueue dedup: a torrent whose qBit state flaps
 * across restarts can re-trigger the completed-transition repeatedly, which
 * would otherwise enqueue a duplicate import each time. We fetch the small set
 * of active (pending/running) import jobs via the indexed kind+status query and
 * match the parsed payload's `downloadId` in JS — robust against JSON
 * whitespace/key-order that a `payload_json LIKE` would miss, and cheap because
 * the active set is tiny. Mirrors `hasActiveHydrateJob`.
 */
export async function hasPendingImportFor(downloadId: number): Promise<boolean> {
  const rows = await getDb()
    .select({ payloadJson: jobs.payloadJson })
    .from(jobs)
    .where(and(eq(jobs.kind, 'import'), inArray(jobs.status, ['pending', 'running'])));
  for (const r of rows) {
    try {
      const payload = JSON.parse(r.payloadJson) as { downloadId?: unknown };
      if (payload?.downloadId === downloadId) return true;
    } catch {
      // Malformed payload — can't match; skip it.
    }
  }
  return false;
}

export async function getJob(id: number): Promise<JobRow | null> {
  const rows = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listRecentJobs(limit: number): Promise<JobRow[]> {
  return getDb()
    .select()
    .from(jobs)
    .orderBy(sql`${jobs.scheduledFor} DESC`)
    .limit(limit);
}

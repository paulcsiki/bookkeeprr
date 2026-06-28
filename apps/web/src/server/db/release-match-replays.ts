import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { releaseMatchReplays, type ReleaseMatchReplayRow } from './schema';
import { withWriteLock } from './write-lock';

export type ReplayDiffInsert = {
  replayRunId: number;
  releaseId: number;
  oldScore: number | null;
  newScore: number | null;
  oldWouldGrab: boolean;
  newWouldGrab: boolean;
  changedKind: 'flipped' | 'rescored';
};

export type ReplayDiffListOpts = {
  kind?: 'flipped' | 'rescored';
  page: number;
  pageSize: number;
};

export type ReplayDiffListResult = {
  rows: ReleaseMatchReplayRow[];
  total: number;
};

export async function insertReplayDiffs(rows: ReplayDiffInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  return withWriteLock(async () => {
    await getDb().insert(releaseMatchReplays).values(rows);
    return rows.length;
  });
}

export async function listReplayDiffs(
  runId: number,
  opts: ReplayDiffListOpts,
): Promise<ReplayDiffListResult> {
  const baseWhere = opts.kind
    ? and(
        eq(releaseMatchReplays.replayRunId, runId),
        eq(releaseMatchReplays.changedKind, opts.kind),
      )
    : eq(releaseMatchReplays.replayRunId, runId);
  const rows = await getDb()
    .select()
    .from(releaseMatchReplays)
    .where(baseWhere)
    .orderBy(desc(releaseMatchReplays.id))
    .limit(opts.pageSize)
    .offset(opts.page * opts.pageSize);
  const [countRow] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(releaseMatchReplays)
    .where(baseWhere);
  return { rows, total: Number(countRow?.count ?? 0) };
}

export async function getReplayDiff(id: number): Promise<ReleaseMatchReplayRow | null> {
  const rows = await getDb()
    .select()
    .from(releaseMatchReplays)
    .where(eq(releaseMatchReplays.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function markReplayDiffAdopted(id: number): Promise<void> {
  return withWriteLock(async () => {
    await getDb()
      .update(releaseMatchReplays)
      .set({ adoptedAt: new Date() })
      .where(eq(releaseMatchReplays.id, id));
  });
}

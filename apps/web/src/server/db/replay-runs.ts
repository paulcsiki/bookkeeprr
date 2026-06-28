import { desc, eq } from 'drizzle-orm';
import { getDb } from './client';
import { replayRuns, type ReplayRunRow } from './schema';
import { withWriteLock } from './write-lock';
import type { ScoringWeights, AdultFilter } from './settings/matcher';

export type CreateReplayRunInput = {
  windowDays: number | null;
  weightsSnapshot: ScoringWeights;
  adultFilterSnapshot: AdultFilter;
  seriesId?: number | null;
};

export type ReplayRunCounters = {
  releasesTotal: number;
  releasesFlipped: number;
  releasesRescored: number;
};

export async function createReplayRun(input: CreateReplayRunInput): Promise<ReplayRunRow> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(replayRuns)
      .values({
        status: 'running',
        windowDays: input.windowDays,
        weightsSnapshotJson: JSON.stringify(input.weightsSnapshot),
        adultFilterSnapshotJson: JSON.stringify(input.adultFilterSnapshot),
        seriesId: input.seriesId ?? null,
      })
      .returning();
    if (!row) throw new Error('createReplayRun: insert returned no row');
    return row;
  });
}

export async function getReplayRun(id: number): Promise<ReplayRunRow | null> {
  const rows = await getDb().select().from(replayRuns).where(eq(replayRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getInProgressReplayRun(): Promise<ReplayRunRow | null> {
  const rows = await getDb()
    .select()
    .from(replayRuns)
    .where(eq(replayRuns.status, 'running'))
    .limit(1);
  return rows[0] ?? null;
}

export async function listReplayRuns(limit: number): Promise<ReplayRunRow[]> {
  return getDb().select().from(replayRuns).orderBy(desc(replayRuns.triggeredAt)).limit(limit);
}

export async function markReplayRunComplete(
  id: number,
  counters: ReplayRunCounters,
): Promise<void> {
  return withWriteLock(async () => {
    await getDb()
      .update(replayRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
        releasesTotal: counters.releasesTotal,
        releasesFlipped: counters.releasesFlipped,
        releasesRescored: counters.releasesRescored,
      })
      .where(eq(replayRuns.id, id));
  });
}

export async function markReplayRunFailed(id: number, errorMessage: string): Promise<void> {
  return withWriteLock(async () => {
    await getDb()
      .update(replayRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage,
      })
      .where(eq(replayRuns.id, id));
  });
}

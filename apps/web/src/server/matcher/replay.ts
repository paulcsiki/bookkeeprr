import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import {
  downloads,
  releases,
  libraryFiles,
  volumes,
  chapters,
  type ReleaseRow,
  type SeriesRow,
} from '@/server/db/schema';
import { getReplayRun, markReplayRunComplete, markReplayRunFailed } from '@/server/db/replay-runs';
import { insertReplayDiffs, type ReplayDiffInsert } from '@/server/db/release-match-replays';
import { ScoringWeightsSchema, AdultFilterSchema } from '@/server/db/settings/matcher';
import { scoreRelease } from '@/server/matcher/score';
import { decideGrabs } from '@/server/auto-grab/decide';
import { parseReleaseTitle, refineForSeries } from '@/server/parser/release';
import { listReleasesBySeries } from '@/server/db/releases';
import { listDownloadsForReleaseIds } from '@/server/db/downloads';
import { getQualityProfile } from '@/server/db/quality-profiles';
import { getSeries, listSeriesWithRecentReleases } from '@/server/db/series';
import { logger } from '@/server/logger';
import type { IndexerResult } from '@/server/integrations/indexers/types';

const ACTIVE: ReadonlySet<string> = new Set(['queued', 'downloading', 'importing']);
const RESCORE_THRESHOLD = 5;

/**
 * Re-runs the matcher+auto-grab decision against every release in scope under
 * the snapshot weights stored on the replay run row, then diffs the new decision
 * set against the historical `downloads` table. Persists one
 * `release_match_replays` row per release whose state changed (flipped or
 * rescored). Mirrors the live `runAutoGrabForSeries` decision path 1:1.
 */
export async function replayMatcher(runId: number): Promise<void> {
  const log = logger().child({ component: 'replay-matcher', runId });
  const run = await getReplayRun(runId);
  if (!run) throw new Error(`replayMatcher: run ${runId} not found`);

  try {
    const weights = ScoringWeightsSchema.parse(JSON.parse(run.weightsSnapshotJson));
    const adultFilter = AdultFilterSchema.parse(JSON.parse(run.adultFilterSnapshotJson));
    const cutoff =
      run.windowDays === null ? null : new Date(Date.now() - run.windowDays * 24 * 60 * 60 * 1000);

    let total = 0;
    let flipped = 0;
    let rescored = 0;

    const seriesList =
      run.seriesId !== null
        ? [await getSeries(run.seriesId)].filter((s): s is SeriesRow => s !== null)
        : await listSeriesWithRecentReleases(cutoff);
    log.info(
      { seriesCount: seriesList.length, scopedToSeriesId: run.seriesId },
      'replay: starting',
    );

    for (const s of seriesList) {
      const candidates = await loadCandidatesForReplay(s.id, cutoff);
      if (candidates.length === 0) continue;

      const profile = await getQualityProfile(s.qualityProfileId);
      if (!profile) {
        log.warn({ seriesId: s.id, qpId: s.qualityProfileId }, 'replay: profile missing, skipping');
        continue;
      }

      // Recompute new score per release using snapshot weights + current profile.
      const withNewScores = candidates.map((c) => {
        const parsed = refineForSeries(parseReleaseTitle(c.title), { granularity: s.granularity, totalVolumes: s.totalVolumes });
        const raw = releaseToIndexerResult(c);
        const newScore = scoreRelease(parsed, profile, raw, weights, adultFilter);
        return { release: c, newScore };
      });

      // Build a synthetic release set whose .score is the *new* score for decideGrabs.
      const releasesForDecide: ReleaseRow[] = withNewScores.map((w) => ({
        ...w.release,
        score: w.newScore,
      }));

      const { ownedVolumes, ownedChapters, totalKnownChapters } = await loadOwnership(s);
      const activeDownloadReleaseIds = await loadActiveDownloads(releasesForDecide);
      const decisions = decideGrabs({
        series: s,
        releases: releasesForDecide,
        ownedVolumes,
        ownedChapters,
        activeDownloadReleaseIds,
        totalKnownChapters,
      });
      const newWinners = new Set(decisions.map((d) => d.releaseId));

      const oldWinners = await loadDownloadedReleaseIds(s.id);

      const diffs: ReplayDiffInsert[] = [];
      for (const w of withNewScores) {
        total += 1;
        const c = w.release;
        const oldWouldGrab = oldWinners.has(c.id);
        const newWouldGrab = newWinners.has(c.id);
        const oldScore = c.score;
        const newScore = w.newScore;

        if (oldWouldGrab !== newWouldGrab) {
          flipped += 1;
          diffs.push({
            replayRunId: runId,
            releaseId: c.id,
            oldScore: roundOrNull(oldScore),
            newScore: roundOrNull(newScore),
            oldWouldGrab,
            newWouldGrab,
            changedKind: 'flipped',
          });
        } else if (
          Math.abs((newScore ?? 0) - (oldScore ?? 0)) > RESCORE_THRESHOLD &&
          // A null↔null transition with both sides zero shouldn't count.
          (oldScore !== null || newScore !== null)
        ) {
          rescored += 1;
          diffs.push({
            replayRunId: runId,
            releaseId: c.id,
            oldScore: roundOrNull(oldScore),
            newScore: roundOrNull(newScore),
            oldWouldGrab,
            newWouldGrab,
            changedKind: 'rescored',
          });
        }
      }
      if (diffs.length > 0) await insertReplayDiffs(diffs);
    }

    await markReplayRunComplete(runId, {
      releasesTotal: total,
      releasesFlipped: flipped,
      releasesRescored: rescored,
    });
    log.info({ total, flipped, rescored }, 'replay: completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, 'replay: failed');
    await markReplayRunFailed(runId, message);
    throw err;
  }
}

function roundOrNull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Math.round(v);
}

/**
 * Synthesize an IndexerResult from a stored release row. `category` is unknown
 * post-hoc, so we use a non-adult sentinel ('3_1', the nyaa manga category);
 * blocked-category replay would already have filtered the release at ingest
 * time, so the adult filter is effectively a no-op on stored releases
 * regardless.
 */
function releaseToIndexerResult(r: ReleaseRow): IndexerResult {
  return {
    guid: r.indexerGuid,
    title: r.title,
    link: r.link,
    sizeBytes: r.sizeBytes,
    seeders: r.seeders,
    leechers: r.leechers,
    pubDate: r.publishedAt,
    infoHash: null,
    category: '3_1',
    trusted: r.trusted ?? false,
    remake: r.remake ?? false,
  };
}

async function loadCandidatesForReplay(
  seriesId: number,
  cutoff: Date | null,
): Promise<ReleaseRow[]> {
  const rows = await listReleasesBySeries(seriesId, 500);
  // Permanently-rejected releases are excluded from live auto-grab; exclude them
  // from replay too so the diff accurately mirrors what live would decide.
  const eligible = rows.filter((r) => r.rejectedAt == null);
  if (cutoff === null) return eligible;
  // Window by discovery time, not the release's own pub date — a back-catalogue
  // book discovered today can have a published_at years in the past.
  return eligible.filter((r) => r.discoveredAt && r.discoveredAt >= cutoff);
}

async function loadOwnership(s: SeriesRow): Promise<{
  ownedVolumes: Set<number>;
  ownedChapters: Set<number>;
  totalKnownChapters: number[] | undefined;
}> {
  const ownedVolumes = new Set<number>();
  const ownedChapters = new Set<number>();
  if (s.granularity === 'volume') {
    const rows = await getDb()
      .select({ number: volumes.number })
      .from(libraryFiles)
      .innerJoin(volumes, eq(libraryFiles.volumeId, volumes.id))
      .where(eq(libraryFiles.seriesId, s.id));
    rows.forEach((r) => ownedVolumes.add(r.number));
  } else {
    const rows = await getDb()
      .select({ numberSort: chapters.numberSort })
      .from(libraryFiles)
      .innerJoin(chapters, eq(libraryFiles.chapterId, chapters.id))
      .where(eq(libraryFiles.seriesId, s.id));
    rows.forEach((r) => ownedChapters.add(r.numberSort));
  }
  let totalKnownChapters: number[] | undefined;
  if (s.granularity === 'chapter') {
    const allCh = await getDb()
      .select({ numberSort: chapters.numberSort })
      .from(chapters)
      .where(eq(chapters.seriesId, s.id));
    totalKnownChapters = allCh.map((r) => r.numberSort);
  }
  return { ownedVolumes, ownedChapters, totalKnownChapters };
}

async function loadActiveDownloads(rs: ReleaseRow[]): Promise<Set<number>> {
  if (rs.length === 0) return new Set();
  const downloadRows = await listDownloadsForReleaseIds(rs.map((r) => r.id));
  return new Set(downloadRows.filter((d) => ACTIVE.has(d.status)).map((d) => d.releaseId));
}

async function loadDownloadedReleaseIds(seriesId: number): Promise<Set<number>> {
  const rows = await getDb()
    .select({ releaseId: downloads.releaseId })
    .from(downloads)
    .innerJoin(releases, eq(releases.id, downloads.releaseId))
    .where(eq(releases.seriesId, seriesId));
  return new Set(rows.map((r) => r.releaseId));
}

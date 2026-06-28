import { eq } from 'drizzle-orm';
import type { SeriesRow } from '@/server/db/schema';
import { getDb } from '@/server/db/client';
import { libraryFiles, volumes, chapters } from '@/server/db/schema';
import {
  listReleasesBySeries,
  isReleaseInGrabBackoff,
  recordGrabFailure,
  clearGrabFailure,
} from '@/server/db/releases';
import { listIndexers, isManualOnlyIndexer } from '@/server/db/indexers';
import { listDownloadsForReleaseIds, hasActiveDownloadForSeriesTarget } from '@/server/db/downloads';
import { grabRelease } from '@/server/grabber';
import { logger } from '@/server/logger';
import { safeNotifyFailure } from '@/server/notifications';
import { autoGrabSetting } from '@/server/db/settings/auto-grab';
import { recordAuditEvent } from '@/server/audit/record';
import { decideGrabs, candidatesFor, eligibleReleasesFor } from './decide';

// Grab-error codes that mean "this particular release/indexer didn't work, try
// the next candidate covering the same target(s)". Distinct from terminal codes
// (not-configured stops the whole cycle) and already-grabbed (target handled).
const RETRYABLE_GRAB_CODES: ReadonlySet<string> = new Set([
  'download-link-failed',
  'qbt-not-visible',
  'qbt-add-failed',
  'malformed-link',
  'not-found',
  'orphaned',
  // The chosen release duplicates a torrent already tracked (often a rejected
  // twin on another indexer). Skip it and try the next-best candidate covering
  // the same target; checkHashDuplicate has already excluded it going forward.
  'duplicate-grab',
]);

const ACTIVE: ReadonlySet<string> = new Set(['queued', 'downloading', 'importing']);

export type AutoGrabResult = {
  seriesId: number;
  decisions: number;
  succeeded: number;
  skipped: number;
  failed: { releaseId: number; reason: string }[];
};

export async function runAutoGrabForSeries(series: SeriesRow): Promise<AutoGrabResult> {
  const log = logger().child({ component: 'auto-grab', seriesId: series.id });
  const result: AutoGrabResult = {
    seriesId: series.id,
    decisions: 0,
    succeeded: 0,
    skipped: 0,
    failed: [],
  };
  if (series.monitoring === 'none') return result;

  const autoGrabCfg = await autoGrabSetting.get();

  const releases = await listReleasesBySeries(series.id, 500);
  if (releases.length === 0) return result;

  // MAM releases (from interactive search) must never be auto-grabbed — exclude
  // them from candidate selection regardless of how they entered the table.
  const allIndexers = await listIndexers();
  const manualOnlyIndexerIds = new Set(
    allIndexers.filter((i) => isManualOnlyIndexer(i.kind)).map((i) => i.id),
  );

  // Releases whose last grab failed and are still inside their backoff window.
  // They're excluded from both decision-making and the fallback candidate list,
  // so a broken indexer / dead torrent isn't hammered — or re-notified — every
  // poll cycle. Once the window elapses the release is eligible again.
  const now = Date.now();
  const backedOff = new Set(
    releases.filter((r) => isReleaseInGrabBackoff(r, now)).map((r) => r.id),
  );
  // Permanently rejected releases (bad content / wrong format). Never grabbed
  // again — excluded from both decision-making and the fallback candidate list,
  // so auto-grab picks the next-best release for the same target(s) instead.
  const rejected = new Set(releases.filter((r) => r.rejectedAt != null).map((r) => r.id));
  const eligibleReleases = releases.filter(
    (r) => !backedOff.has(r.id) && !rejected.has(r.id) && !manualOnlyIndexerIds.has(r.indexerId),
  );

  // Compute owned + active sets
  const ownedVolumes = new Set<number>();
  const ownedChapters = new Set<number>();
  if (series.granularity === 'volume') {
    const rows = await getDb()
      .select({ number: volumes.number })
      .from(libraryFiles)
      .innerJoin(volumes, eq(libraryFiles.volumeId, volumes.id))
      .where(eq(libraryFiles.seriesId, series.id));
    rows.forEach((r) => ownedVolumes.add(r.number));
  } else {
    const rows = await getDb()
      .select({ numberSort: chapters.numberSort })
      .from(libraryFiles)
      .innerJoin(chapters, eq(libraryFiles.chapterId, chapters.id))
      .where(eq(libraryFiles.seriesId, series.id));
    rows.forEach((r) => ownedChapters.add(r.numberSort));
  }

  let totalKnownChapters: number[] | undefined;
  if (series.granularity === 'chapter') {
    const allCh = await getDb()
      .select({ numberSort: chapters.numberSort })
      .from(chapters)
      .where(eq(chapters.seriesId, series.id));
    totalKnownChapters = allCh.map((r) => r.numberSort);
  }

  const downloadRows = await listDownloadsForReleaseIds(releases.map((r) => r.id));
  const activeDownloadReleaseIds = new Set(
    downloadRows.filter((d) => ACTIVE.has(d.status)).map((d) => d.releaseId),
  );
  const importedReleaseIds = new Set(
    downloadRows.filter((d) => d.status === 'imported').map((d) => d.releaseId),
  );

  // Apply the single-book guard once so that BOTH the decision engine and the
  // fallback candidatesFor call below use the same filtered set. Filtering here
  // (rather than duplicating the predicate) is the DRY fix for I2: without it,
  // candidatesFor receives the UNFILTERED list and can surface a multi-book
  // batch as a fallback candidate for a single-volume series.
  const singleBookFiltered = eligibleReleasesFor(series, eligibleReleases);

  const decisions = decideGrabs({
    series,
    releases: singleBookFiltered,
    ownedVolumes,
    ownedChapters,
    activeDownloadReleaseIds,
    importedReleaseIds,
    totalKnownChapters,
  });
  result.decisions = decisions.length;

  if (autoGrabCfg.dryRun) {
    // Dry-run mode: skip grabRelease entirely. Emit one audit event per decision.
    for (const d of decisions) {
      await recordAuditEvent({
        actor: { kind: 'system' },
        action: 'auto_grab.dry_run_decision',
        target: { kind: 'series', id: String(series.id) },
        metadata: {
          releaseId: d.releaseId,
          reason: d.reason,
          targets: d.targets,
        },
      });
      result.skipped++;
      log.info(
        { releaseId: d.releaseId, reason: d.reason, targets: d.targets },
        'auto-grab dry-run decision',
      );
    }
    return result;
  }

  // releaseIds we've already handed to grabRelease this cycle — so a release
  // that covers two targets, or appears as a fallback in two decisions, is never
  // grabbed twice.
  const attempted = new Set<number>();
  decisionLoop: for (const d of decisions) {
    // Per-target active-grab guard: if ANY target in this decision already has
    // an active (queued/downloading/completed/importing/imported) download in the
    // DB, skip the entire decision this cycle.  A failed/stalled download is NOT
    // active, so once it's been marked `failed` the next cycle is free to grab
    // the next-best candidate for the same target.  This prevents opening a 2nd
    // release while an earlier grab is still in flight.
    let targetAlreadyActive = false;
    for (const target of d.targets) {
      if (await hasActiveDownloadForSeriesTarget(series.id, target)) {
        targetAlreadyActive = true;
        break;
      }
    }
    if (targetAlreadyActive) {
      result.skipped++;
      log.info(
        { releaseId: d.releaseId, reason: d.reason, targets: d.targets },
        'auto-grab skipped — target already has an active download',
      );
      continue;
    }

    const exclude = new Set<number>([
      ...activeDownloadReleaseIds,
      ...importedReleaseIds,
      ...backedOff,
      ...rejected,
      ...attempted,
    ]);
    const candidates = candidatesFor(d, singleBookFiltered, exclude);

    let handled = false;
    let usedFallback = false;
    let lastErr: { code: string; message: string } | null = null;
    // Releases we actually tried-and-failed this decision — each gets its grab
    // failure recorded so it backs off next cycle.
    const failedThisDecision: number[] = [];

    for (const releaseId of candidates) {
      if (attempted.has(releaseId)) continue;
      attempted.add(releaseId);
      const r = await grabRelease(releaseId);

      if (r.ok) {
        await clearGrabFailure(releaseId);
        result.succeeded++;
        await recordAuditEvent({
          actor: { kind: 'system' },
          action: 'auto_grab.grabbed',
          target: { kind: 'series', id: String(series.id) },
          metadata: {
            releaseId,
            reason: d.reason,
            targets: d.targets,
            ...(usedFallback ? { viaFallback: true } : {}),
          },
        });
        log.info(
          { releaseId, reason: d.reason, targets: d.targets, viaFallback: usedFallback },
          'auto-grab succeeded',
        );
        handled = true;
        break;
      }

      const code = r.error.code;
      if (code === 'not-configured') {
        // qbt unconfigured — no point trying anything else this cycle.
        result.skipped++;
        log.info({ releaseId, code }, 'auto-grab skipped (qbt not configured)');
        break decisionLoop;
      }
      if (code === 'already-grabbed') {
        // This target is already covered by an active download — done, no fail.
        await clearGrabFailure(releaseId);
        result.skipped++;
        log.info({ releaseId, code }, 'auto-grab skipped (already grabbed)');
        handled = true;
        break;
      }

      lastErr = { code, message: r.error.message };
      failedThisDecision.push(releaseId);
      if (RETRYABLE_GRAB_CODES.has(code)) {
        usedFallback = true;
        log.warn(
          { releaseId, code, targets: d.targets },
          'auto-grab candidate failed — trying another indexer',
        );
        continue; // fall through to the next-best release for the same target(s)
      }
      // Unknown/other code: stop trying candidates for this decision.
      break;
    }

    if (!handled) {
      const reason = lastErr?.code ?? 'no-candidate';
      result.failed.push({ releaseId: d.releaseId, reason });
      log.warn(
        { releaseId: d.releaseId, error: lastErr, candidates: candidates.length },
        'auto-grab failed (all candidates exhausted)',
      );

      // Record the failure on every release we tried so they back off and aren't
      // re-attempted next cycle. Notify ONLY on the primary release's FIRST
      // failure — repeats after the backoff window expires stay silent, which is
      // what stops the per-cycle Discord flood for a persistently-broken target.
      const primaryWasFresh =
        (releases.find((r) => r.id === d.releaseId)?.grabAttempts ?? 0) === 0;
      for (const failedId of failedThisDecision) {
        await recordGrabFailure(failedId);
      }
      if (
        lastErr &&
        lastErr.code !== 'orphaned' &&
        lastErr.code !== 'not-found' &&
        primaryWasFresh
      ) {
        await safeNotifyFailure('grab', null, `[${lastErr.code}] ${lastErr.message}`);
      }
    }
  }

  return result;
}

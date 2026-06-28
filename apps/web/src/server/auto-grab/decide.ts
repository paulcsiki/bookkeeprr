import type { SeriesRow, ReleaseRow } from '@/server/db/schema';

export type AutoGrabInput = {
  series: SeriesRow;
  releases: ReleaseRow[]; // ordered by score DESC, publishedAt DESC
  ownedVolumes: Set<number>;
  ownedChapters: Set<number>;
  activeDownloadReleaseIds: Set<number>;
  importedReleaseIds?: Set<number>;
  totalKnownChapters?: number[]; // numberSort values, chapter granularity only
};

export type GrabDecision = {
  releaseId: number;
  reason: 'batch-covers-all' | 'best-per-target';
  targets: number[];
};

export function rangeCovers(release: ReleaseRow, target: number): boolean {
  if (release.targetLow === null || release.targetHigh === null) return false;
  return target >= release.targetLow && target <= release.targetHigh;
}

function unownedVolumeSet(series: SeriesRow, owned: Set<number>): Set<number> | null {
  if (
    series.totalVolumes === null ||
    series.totalVolumes === undefined ||
    series.totalVolumes <= 0
  ) {
    return null;
  }
  const out = new Set<number>();
  for (let n = 1; n <= series.totalVolumes; n++) {
    if (!owned.has(n)) out.add(n);
  }
  return out;
}

function unownedChapterSet(
  totalKnown: number[] | undefined,
  owned: Set<number>,
): Set<number> | null {
  if (!totalKnown || totalKnown.length === 0) return null;
  const out = new Set<number>();
  for (const n of totalKnown) {
    if (!owned.has(n)) out.add(n);
  }
  return out;
}

export function batchCoversAll(release: ReleaseRow, unowned: Set<number>): boolean {
  if (release.targetKind !== 'batch') return false;
  if (release.targetLow === null || release.targetHigh === null) return false;
  for (const t of unowned) {
    if (!rangeCovers(release, t)) return false;
  }
  return true;
}

/**
 * Ordered fallback candidates for a decision: every release that covers the same
 * target(s), best score first, minus ones already attempted/active/imported. The
 * primary pick (`decision.releaseId`) always sorts first. This is what lets a
 * failed grab fall through to the same volume from a different indexer.
 */
export function candidatesFor(
  decision: GrabDecision,
  releases: ReleaseRow[],
  exclude: ReadonlySet<number>,
): number[] {
  const targets = new Set(decision.targets);
  const covers = (r: ReleaseRow): boolean =>
    decision.reason === 'batch-covers-all'
      ? batchCoversAll(r, targets)
      : decision.targets.every((t) => rangeCovers(r, t));
  const ids = releases
    .filter((r) => !exclude.has(r.id) && covers(r))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((r) => r.id);
  // Ensure the decision's primary pick leads, even if scores tie.
  return [decision.releaseId, ...ids.filter((id) => id !== decision.releaseId)];
}

// Single-book guard: a series with contentType ∈ {ebook, audiobook, light_novel}
// and totalVolumes ≤ 1 must never auto-grab a multi-book pack (e.g. a trilogy box-set).
//
// IMPORTANT — use a narrow filter, not a blanket targetKind !== 'batch':
// A bare ebook with no volume number in its title is stored as
// targetKind='batch', targetLow=1, targetHigh=1 after refineForSeries for a
// 1-volume series (confirmed by the characterization test in decide.test.ts).
// That is a valid single-book release, not a multi-book pack.
// Only exclude batches where targetHigh > 1 (e.g. v1-v3 trilogy pack) or
// the range is entirely absent (null/null — keyword-only packs like "Trilogy").
const BOOK_TYPES = new Set(['ebook', 'audiobook', 'light_novel']);

/**
 * Returns the release list filtered for the series' single-book constraint.
 * For a book series with totalVolumes ≤ 1, multi-book batch packs are dropped.
 * All other series receive the list unmodified.
 *
 * Exported so that both `decideGrabs` and the fallback `candidatesFor` call in
 * `run.ts` share the same predicate (DRY — no duplicated filter logic).
 */
export function eligibleReleasesFor(series: SeriesRow, releases: ReleaseRow[]): ReleaseRow[] {
  const isSingleBook = BOOK_TYPES.has(series.contentType) && (series.totalVolumes ?? 1) <= 1;
  if (!isSingleBook) return releases;
  return releases.filter(
    (r) =>
      !(
        r.targetKind === 'batch' &&
        ((r.targetHigh ?? 0) > 1 || (r.targetLow === null && r.targetHigh === null))
      ),
  );
}

export function decideGrabs(input: AutoGrabInput): GrabDecision[] {
  const { series, ownedVolumes, ownedChapters, activeDownloadReleaseIds, totalKnownChapters } =
    input;
  const importedReleaseIds = input.importedReleaseIds ?? new Set<number>();

  const unowned =
    series.granularity === 'volume'
      ? unownedVolumeSet(series, ownedVolumes)
      : unownedChapterSet(totalKnownChapters, ownedChapters);
  if (unowned === null || unowned.size === 0) return [];

  // Sort releases by score DESC so highest-scored is always tried first, then
  // apply the single-book guard via the shared eligibleReleasesFor helper.
  const sorted = [...input.releases].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const releases = eligibleReleasesFor(series, sorted);

  // Batch sweep: collect all covering releases, then sort by
  // [withinTotal desc, score desc] for volume series with a known totalVolumes.
  // This prefers a batch whose range fits within the series' published count
  // (e.g. v01-07 for a 7-volume series) over one that exceeds it (v01-11),
  // avoiding a higher-scored cross-type pack from winning. When totalVolumes is
  // unknown or the series is chapter-granularity, sort by score only.
  const hasKnownTotal =
    series.granularity === 'volume' &&
    series.totalVolumes != null &&
    series.totalVolumes > 0;
  const withinTotal = (r: ReleaseRow): boolean =>
    hasKnownTotal && r.targetHigh != null && r.targetHigh <= series.totalVolumes!;

  const coveringBatches = releases.filter(
    (r) =>
      !activeDownloadReleaseIds.has(r.id) &&
      !importedReleaseIds.has(r.id) &&
      batchCoversAll(r, unowned),
  );
  coveringBatches.sort((a, b) => {
    const aIn = withinTotal(a) ? 1 : 0;
    const bIn = withinTotal(b) ? 1 : 0;
    if (bIn !== aIn) return bIn - aIn; // withinTotal desc
    return (b.score ?? 0) - (a.score ?? 0); // score desc
  });
  if (coveringBatches.length > 0) {
    const r = coveringBatches[0]!;
    return [
      {
        releaseId: r.id,
        reason: 'batch-covers-all',
        targets: Array.from(unowned).sort((a, b) => a - b),
      },
    ];
  }

  // Per-target sweep
  const decisions: GrabDecision[] = [];
  const chosen = new Set<number>();
  const targetsSorted = Array.from(unowned).sort((a, b) => a - b);
  for (const target of targetsSorted) {
    let pick: ReleaseRow | null = null;
    for (const r of releases) {
      if (activeDownloadReleaseIds.has(r.id)) continue;
      if (importedReleaseIds.has(r.id)) continue; // already produced an import — don't re-grab
      if (chosen.has(r.id)) continue;
      if (rangeCovers(r, target)) {
        pick = r;
        break;
      }
    }
    if (pick) {
      decisions.push({ releaseId: pick.id, reason: 'best-per-target', targets: [target] });
      chosen.add(pick.id);
    }
  }
  return decisions;
}

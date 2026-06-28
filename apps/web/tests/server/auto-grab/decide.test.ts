import { describe, expect, it } from 'vitest';
import { decideGrabs, candidatesFor, eligibleReleasesFor, type GrabDecision } from '@/server/auto-grab/decide';
import { parseReleaseTitle, refineForSeries } from '@/server/parser/release';
import type { SeriesRow, ReleaseRow } from '@/server/db/schema';

function series(over: Partial<SeriesRow> = {}): SeriesRow {
  return {
    id: 1,
    anilistId: 1,
    mangadexId: null,
    titleEnglish: 'Test',
    titleRomaji: null,
    titleNative: null,
    status: 'releasing',
    coverUrl: null,
    description: null,
    totalVolumes: 10,
    totalChapters: null,
    rootPath: '/x',
    monitoring: 'all',
    granularity: 'volume',
    qualityProfileId: 1,
    extraSearchTermsJson: '[]',
    addedAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as SeriesRow;
}

function release(id: number, over: Partial<ReleaseRow>): ReleaseRow {
  return {
    id,
    seriesId: 1,
    indexerId: 1,
    indexerGuid: `g${id}`,
    title: `t${id}`,
    link: 'magnet:?xt=urn:btih:x',
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    groupName: null,
    language: 'en',
    sizeBytes: 0,
    seeders: 0,
    leechers: 0,
    publishedAt: new Date(),
    score: 0,
    ...over,
  } as ReleaseRow;
}

describe('candidatesFor — indexer fallback ordering', () => {
  const decision: GrabDecision = { releaseId: 5, reason: 'best-per-target', targets: [1] };

  it('lists the primary pick first, then other covering releases by score desc', () => {
    const releases = [
      release(5, { targetLow: 1, targetHigh: 1, score: 50, indexerId: 1 }),
      release(7, { targetLow: 1, targetHigh: 1, score: 90, indexerId: 2 }),
      release(8, { targetLow: 1, targetHigh: 1, score: 10, indexerId: 3 }),
      release(9, { targetLow: 2, targetHigh: 2, score: 99, indexerId: 4 }), // wrong target
    ];
    expect(candidatesFor(decision, releases, new Set())).toEqual([5, 7, 8]);
  });

  it('excludes already-attempted / active / imported releases', () => {
    const releases = [
      release(5, { targetLow: 1, targetHigh: 1, score: 50 }),
      release(7, { targetLow: 1, targetHigh: 1, score: 90 }),
    ];
    // 7 excluded → only the primary remains.
    expect(candidatesFor(decision, releases, new Set([7]))).toEqual([5]);
  });

  it('batch decisions fall back to other batches covering all targets', () => {
    const batch: GrabDecision = { releaseId: 1, reason: 'batch-covers-all', targets: [1, 2] };
    const releases = [
      release(1, { targetKind: 'batch', targetLow: 1, targetHigh: 2, score: 30 }),
      release(2, { targetKind: 'batch', targetLow: 1, targetHigh: 2, score: 80 }),
      release(3, { targetKind: 'batch', targetLow: 1, targetHigh: 1, score: 99 }), // misses vol 2
    ];
    expect(candidatesFor(batch, releases, new Set())).toEqual([1, 2]);
  });
});

describe('decideGrabs — empty cases', () => {
  it('returns [] when unowned set is empty', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: 3 }),
      releases: [release(1, { score: 100 })],
      ownedVolumes: new Set([1, 2, 3]),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    expect(r).toEqual([]);
  });

  it('returns [] when totalVolumes is null', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: null }),
      releases: [release(1, { score: 100 })],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    expect(r).toEqual([]);
  });

  it('returns [] when no releases match unowned', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: 3 }),
      releases: [release(1, { targetLow: 99, targetHigh: 99 })],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    expect(r).toEqual([]);
  });
});

describe('decideGrabs — batch covers all', () => {
  it('picks a batch that covers the entire unowned set', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: 3 }),
      releases: [
        release(1, { score: 50, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
        release(2, { score: 100, targetKind: 'batch', targetLow: 1, targetHigh: 3 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ releaseId: 2, reason: 'batch-covers-all' });
  });

  it('picks lower-scored batch over higher-scored per-target releases when it covers all', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: 2 }),
      releases: [
        release(1, { score: 200, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
        release(2, { score: 200, targetKind: 'volume', targetLow: 2, targetHigh: 2 }),
        release(3, { score: 30, targetKind: 'batch', targetLow: 1, targetHigh: 2 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    // releases must be in score-desc order for the algorithm to work; sort here:
    const sorted = r;
    expect(sorted[0]?.releaseId).toBe(3);
    expect(sorted[0]?.reason).toBe('batch-covers-all');
  });

  it('skips a batch with an active download and falls through to per-target', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: 2 }),
      releases: [
        release(1, { score: 100, targetKind: 'batch', targetLow: 1, targetHigh: 2 }),
        release(2, { score: 50, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
        release(3, { score: 50, targetKind: 'volume', targetLow: 2, targetHigh: 2 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set([1]), // the batch is already in flight
    });
    expect(r).toHaveLength(2);
    const ids = r.map((d) => d.releaseId).sort();
    expect(ids).toEqual([2, 3]);
  });
});

describe('decideGrabs — per-target', () => {
  it('picks highest-scored release per target', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: 2 }),
      releases: [
        release(1, { score: 10, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
        release(2, { score: 20, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
        release(3, { score: 50, targetKind: 'volume', targetLow: 2, targetHigh: 2 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    expect(r).toHaveLength(2);
    expect(r.find((d) => d.targets[0] === 1)?.releaseId).toBe(2);
    expect(r.find((d) => d.targets[0] === 2)?.releaseId).toBe(3);
  });

  it('dedupes: same release picked for two targets in one cycle', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: 2 }),
      releases: [
        // partial batch v1-v2 with high score — same release covers both, but
        // because targetKind is 'batch' covering ALL unowned, batch sweep
        // picks it first. To exercise the dedup path, use a non-batch range:
        release(1, { score: 100, targetKind: 'volume', targetLow: 1, targetHigh: 2 }),
        release(2, { score: 50, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
        release(3, { score: 50, targetKind: 'volume', targetLow: 2, targetHigh: 2 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    // release 1 covers both — but per-target sweep tries highest-scored first.
    // For v1: release 1 (score 100) is best → chosen.
    // For v2: release 1 is already chosen → fallback to release 3.
    expect(r).toHaveLength(2);
    expect(r.find((d) => d.targets[0] === 1)?.releaseId).toBe(1);
    expect(r.find((d) => d.targets[0] === 2)?.releaseId).toBe(3);
  });

  it('skips active releases when picking per-target', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: 1 }),
      releases: [
        release(1, { score: 100, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
        release(2, { score: 50, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set([1]),
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.releaseId).toBe(2);
  });
});

describe('decideGrabs imported-release safeguard', () => {
  it('does not re-grab a synthetic-range batch that already produced an import', () => {
    const releases = [
      release(7, { targetKind: 'batch', targetLow: 1, targetHigh: 10, score: 5 }),
    ];
    const decisions = decideGrabs({
      series: series({ id: 1, granularity: 'volume', totalVolumes: 10 }),
      releases,
      ownedVolumes: new Set([1, 2, 3, 4, 5]), // imported v1-5 from this batch
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
      importedReleaseIds: new Set([7]),
    });
    expect(decisions.find((d) => d.releaseId === 7)).toBeUndefined();
  });

  it('still grabs a fresh synthetic-range batch with no prior import', () => {
    const releases = [
      release(7, { targetKind: 'batch', targetLow: 1, targetHigh: 10, score: 5 }),
    ];
    const decisions = decideGrabs({
      series: series({ id: 1, granularity: 'volume', totalVolumes: 10 }),
      releases,
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
      importedReleaseIds: new Set(),
    });
    expect(decisions.find((d) => d.releaseId === 7)).toBeDefined();
  });
});

describe('decideGrabs — prefer in-range batches', () => {
  it('picks the batch whose targetHigh fits within totalVolumes over a higher-scored out-of-range batch', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: 7 }),
      releases: [
        release(1, { score: 8.5, targetKind: 'batch', targetLow: 1, targetHigh: 11 }),
        release(2, { score: 6.7, targetKind: 'batch', targetLow: 1, targetHigh: 7 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ releaseId: 2, reason: 'batch-covers-all' });
  });

  it('picks the higher-scored batch when totalVolumes is null (no preference)', () => {
    const r = decideGrabs({
      series: series({ totalVolumes: null }),
      releases: [
        release(1, { score: 8.5, targetKind: 'batch', targetLow: 1, targetHigh: 11 }),
        release(2, { score: 6.7, targetKind: 'batch', targetLow: 1, targetHigh: 7 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    // With null totalVolumes, no unowned set can be built → returns []
    expect(r).toEqual([]);
  });
});

describe('decideGrabs — chapter granularity', () => {
  it('uses totalKnownChapters for unowned set', () => {
    const r = decideGrabs({
      series: series({ granularity: 'chapter', totalVolumes: null }),
      releases: [release(1, { score: 100, targetKind: 'chapter', targetLow: 5, targetHigh: 5 })],
      ownedVolumes: new Set(),
      ownedChapters: new Set([1, 2, 3]),
      activeDownloadReleaseIds: new Set(),
      totalKnownChapters: [1, 2, 3, 5],
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.releaseId).toBe(1);
    expect(r[0]?.targets).toEqual([5]);
  });

  it('returns [] when totalKnownChapters is empty (no hydrate yet)', () => {
    const r = decideGrabs({
      series: series({ granularity: 'chapter', totalVolumes: null }),
      releases: [release(1, { score: 100 })],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
      totalKnownChapters: [],
    });
    expect(r).toEqual([]);
  });
});

// ─── Characterization: bare ebook parse result ───────────────────────────────
// Confirms how a bare ebook title (no volume number) is stored after
// parseReleaseTitle + refineForSeries, which drives the narrow filter choice
// in the single-book batch guard below.
describe('characterization: bare ebook parse result', () => {
  it('bare ebook with no volume number refines to targetKind=batch with range 1..1 for a 1-volume series', () => {
    const parsed = parseReleaseTitle('Fifty Shades of Grey by E. L. James EPUB');
    const refined = refineForSeries(parsed, { granularity: 'volume', totalVolumes: 1 });
    // CONFIRMED: parses as batch 1..1 — NOT a multi-book pack.
    // Therefore the guard must use a NARROW filter (targetHigh > 1 or null-range),
    // not a blanket targetKind !== 'batch', to preserve single-book releases
    // that happen to be stored as batch.
    expect(refined.targetKind).toBe('batch');
    expect(refined.targetLow).toBe(1);
    expect(refined.targetHigh).toBe(1);
  });
});

// ─── Single-book series rejects multi-book packs ─────────────────────────────
describe('decideGrabs — single-book series rejects multi-book packs', () => {
  it('does not pick a batch pack for a 1-volume ebook series', () => {
    const r = decideGrabs({
      series: series({ contentType: 'ebook', granularity: 'volume', totalVolumes: 1 }),
      releases: [
        release(1, { score: 100, targetKind: 'batch', targetLow: 1, targetHigh: 3 }),
        release(2, { score: 40, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ releaseId: 2 }); // the single volume, not the batch
  });

  it('still picks a manga batch (multi-volume series unaffected)', () => {
    const r = decideGrabs({
      series: series({ contentType: 'manga', granularity: 'volume', totalVolumes: 3 }),
      releases: [release(9, { score: 100, targetKind: 'batch', targetLow: 1, targetHigh: 3 })],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    expect(r[0]).toMatchObject({ releaseId: 9, reason: 'batch-covers-all' });
  });

  it('preserves a bare ebook release stored as batch 1..1 for a 1-volume ebook series', () => {
    // A bare ebook (no vol# in title) is stored as targetKind='batch', targetLow=1, targetHigh=1
    // after refineForSeries. The guard must NOT exclude it — it is a valid single-book release.
    const r = decideGrabs({
      series: series({ contentType: 'ebook', granularity: 'volume', totalVolumes: 1 }),
      releases: [
        release(1, { score: 100, targetKind: 'batch', targetLow: 1, targetHigh: 1 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    // batch 1..1 is a single-book release — should be grabbed via batch-covers-all
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ releaseId: 1, reason: 'batch-covers-all' });
  });

  it('also rejects keyword-only batch packs (null range) for a 1-volume ebook series', () => {
    // A "Trilogy" keyword-only release has targetLow=null, targetHigh=null after parse.
    // The guard must exclude it.
    const r = decideGrabs({
      series: series({ contentType: 'ebook', granularity: 'volume', totalVolumes: 1 }),
      releases: [
        release(1, { score: 100, targetKind: 'batch', targetLow: null, targetHigh: null }),
        release(2, { score: 20, targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
      ],
      ownedVolumes: new Set(),
      ownedChapters: new Set(),
      activeDownloadReleaseIds: new Set(),
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ releaseId: 2 }); // keyword-only batch excluded
  });
});

// ─── I2: candidatesFor respects eligibleReleasesFor for single-book series ────
describe('candidatesFor — single-volume ebook: ranged batch excluded from fallbacks', () => {
  it('does NOT include a v1-3 batch as a fallback candidate for a 1-volume ebook series', () => {
    // Scenario from I2: primary single-vol release fails (retryable), ranged batch
    // (v1-3) has a higher score and covers target 1 — must be excluded via
    // eligibleReleasesFor before candidatesFor is called, mirroring run.ts behaviour.
    const singleVolSeries = series({ contentType: 'ebook', granularity: 'volume', totalVolumes: 1 });
    const allReleases = [
      release(1, { score: 50, targetKind: 'volume', targetLow: 1, targetHigh: 1 }), // primary
      release(2, { score: 90, targetKind: 'batch', targetLow: 1, targetHigh: 3 }),  // multi-book pack
    ];
    // run.ts applies eligibleReleasesFor BEFORE candidatesFor
    const filtered = eligibleReleasesFor(singleVolSeries, allReleases);
    const decision: GrabDecision = { releaseId: 1, reason: 'best-per-target', targets: [1] };
    const candidates = candidatesFor(decision, filtered, new Set());
    // The batch (id=2) must NOT appear — only the single-volume release (id=1) is eligible
    expect(candidates).toEqual([1]);
    expect(candidates).not.toContain(2);
  });
});

import { z } from 'zod';

// ── Matcher replay history ────────────────────────────────────────────────────
// Mirrors the web API exactly:
//   GET /api/settings/matcher/replays?limit=N         → { runs: ReplayRun[] }
//   GET /api/settings/matcher/replays/:runId?page=…   → { run, rows, total }
// Runs are serialized `replay_runs` rows (timestamps → ISO strings); detail
// rows are `release_match_replays` rows hydrated with the release title +
// series title for rendering.

export const ReplayRunStatus = z.enum(['running', 'completed', 'failed']);
export type ReplayRunStatus = z.infer<typeof ReplayRunStatus>;

export const ReplayRun = z.object({
  id: z.number().int().positive(),
  triggeredAt: z.string(),
  completedAt: z.string().nullable(),
  status: ReplayRunStatus,
  // null = "all retained" (no window).
  windowDays: z.number().int().nullable(),
  // Non-null when the replay was scoped to one series.
  seriesId: z.number().int().nullable(),
  releasesTotal: z.number().int().nonnegative(),
  releasesFlipped: z.number().int().nonnegative(),
  releasesRescored: z.number().int().nonnegative(),
  weightsSnapshotJson: z.string(),
  adultFilterSnapshotJson: z.string(),
  errorMessage: z.string().nullable(),
});
export type ReplayRun = z.infer<typeof ReplayRun>;

export const ReplayRunsResponse = z.object({
  runs: z.array(ReplayRun),
});
export type ReplayRunsResponse = z.infer<typeof ReplayRunsResponse>;

export const ReplayDiffRelease = z.object({
  id: z.number().int(),
  title: z.string(),
  seriesId: z.number().int().nullable(),
  seriesTitle: z.string().nullable(),
});
export type ReplayDiffRelease = z.infer<typeof ReplayDiffRelease>;

export const ReplayChangedKind = z.enum(['flipped', 'rescored']);
export type ReplayChangedKind = z.infer<typeof ReplayChangedKind>;

export const ReplayDiffRow = z.object({
  id: z.number().int().positive(),
  replayRunId: z.number().int().positive(),
  releaseId: z.number().int().positive(),
  oldScore: z.number().nullable(),
  newScore: z.number().nullable(),
  oldWouldGrab: z.boolean(),
  newWouldGrab: z.boolean(),
  changedKind: ReplayChangedKind,
  adoptedAt: z.string().nullable(),
  createdAt: z.string(),
  // null when the release row was deleted since the replay ran.
  release: ReplayDiffRelease.nullable(),
});
export type ReplayDiffRow = z.infer<typeof ReplayDiffRow>;

export const ReplayRunDetailResponse = z.object({
  run: ReplayRun,
  rows: z.array(ReplayDiffRow),
  total: z.number().int().nonnegative(),
});
export type ReplayRunDetailResponse = z.infer<typeof ReplayRunDetailResponse>;

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Scan family — request schemas are the single source of truth, used BOTH for
// runtime validation in the route handlers (app/api/scan/**) and for the
// generated OpenAPI spec.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/scan request body. */
export const ScanStartBody = z.object({
  rootPath: z.string().min(1).describe('Absolute directory to scan; must be readable.'),
  targetGroupId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Library group newly imported series are filed into at confirm time. ' +
        'Omit for the library root. 422 when the group does not exist.',
    ),
  structure: z
    .enum(['flat', 'mirror'])
    .optional()
    .describe(
      "Import structure (default 'flat'). flat: every confirmed match gets " +
        "groupId = targetGroupId. mirror: the series directory's path relative " +
        'to the scan root — minus the series folder itself — materializes as ' +
        'nested groups under the target; series folders directly at the scan ' +
        'root land in the target group itself. Only NEWLY created series are ' +
        'assigned — pre-existing matched series keep their group.',
    ),
});

/** POST /api/scan/groups/{dirHash}/match request body. */
export const ScanGroupMatchBody = z.object({
  anilistId: z.number().int().positive(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response schemas — authored from the handlers' actual NextResponse.json
// payloads. Plain z.object (unknown keys stripped) so additive fields are
// tolerated by the test assertions.
// ─────────────────────────────────────────────────────────────────────────────

/** One file of a scan group — its parsed volume/chapter and parser confidence. */
export const ScanGroupFile = z.object({
  path: z.string().describe('Absolute filesystem path on the host.'),
  volume: z.number().int().nullable(),
  chapter: z.string().nullable(),
  confidence: z.number(),
});

/** One unmatched scan group (one per directory with pending scan matches). */
export const ScanGroupSummary = z.object({
  dirHash: z
    .string()
    .describe('Stable hash of the directory path — the {dirHash} path param of the group routes.'),
  directory: z.string().describe('Absolute filesystem path on the host.'),
  dirname: z.string().describe('Basename of `directory`.'),
  fileCount: z.number().int(),
  proposedAniListId: z.number().int().nullable(),
  proposedTitle: z.string().nullable(),
  proposedCoverUrl: z.string().nullable(),
  existingSeriesId: z
    .number()
    .int()
    .nullable()
    .describe('Set when a series with the proposed AniList id is already in the library.'),
  inferredGranularity: z
    .enum(['volume', 'chapter'])
    .describe("'chapter' when any file in the group parsed as a chapter."),
  avgConfidence: z.number(),
  relativeDir: z
    .string()
    .describe(
      "Series directory relative to the scan root that produced the group, e.g. 'Shonen/Vinland Saga'. " +
        "'' when the directory sits at the scan root or the rows predate scan-session params.",
    ),
  structure: z
    .enum(['flat', 'mirror'])
    .nullable()
    .describe(
      "The scan session's import structure (see POST /api/scan). null when the " +
        'scan omitted it (flat default) or the rows predate scan-session params.',
    ),
  files: z.array(ScanGroupFile),
});

/** GET /api/scan/groups 200 — sorted by `dirname`. */
export const ScanGroupsResponse = z.object({
  groups: z.array(ScanGroupSummary),
});

/** POST /api/scan/groups/{dirHash}/match 200 — `updated` = rows in the group
 *  that received the AniList match. */
export const ScanGroupMatchResponse = z.object({
  ok: z.literal(true),
  updated: z.number().int(),
});

/** POST /api/scan/groups/{dirHash}/confirm 200. */
export const ScanGroupConfirmResponse = z.object({
  seriesId: z.number().int(),
  importedCount: z.number().int(),
  skippedCount: z
    .number()
    .int()
    .describe('Files skipped because a library file with the same path already exists.'),
});

/** POST /api/scan/groups/{dirHash}/reject 200. */
export const ScanGroupRejectResponse = z.object({
  rejectedCount: z.number().int(),
});

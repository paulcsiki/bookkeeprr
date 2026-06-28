import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Library family (incl. library-files) — request schemas are the single source
// of truth, used BOTH for runtime validation in the route handlers
// (app/api/library/**, app/api/library-files/**) and for the generated
// OpenAPI spec.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/library-files/{id}/reroute request body. Exactly one of
 *  `volumeNumber` / `chapterNumber` must be present — sending both or
 *  neither returns 400 (the schema alone cannot express the XOR; the route
 *  enforces it). */
export const LibraryFileRerouteBody = z.object({
  seriesId: z.number().int().positive(),
  volumeNumber: z.number().int().min(1).optional(),
  chapterNumber: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response schemas — authored from the handlers' actual NextResponse.json
// payloads. Plain z.object (unknown keys stripped) so additive fields are
// tolerated by the test assertions.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/library/summary 200 — aggregate series counts. */
export const LibrarySummaryResponse = z.object({
  total: z.number().int().describe('Count of all series.'),
  monitored: z.number().int().describe("Count of series where monitoring != 'none'."),
  missing: z
    .number()
    .int()
    .describe(
      'Monitored series whose totalVolumes is set and whose imported ' +
        'volume-level file count is below it. Approximation: ' +
        'chapter-granularity series and series without totalVolumes are ' +
        'counted as not missing.',
    ),
});

/** One series entry of GET /api/library/rename-all — its pending folder
 *  rename plus the file renames (only entries where the path would change). */
export const LibraryRenamePreviewSeries = z.object({
  seriesId: z.number().int(),
  title: z.string(),
  folder: z.object({
    current: z.string(),
    proposed: z.string(),
    changed: z.boolean(),
  }),
  files: z.array(
    z.object({
      libraryFileId: z.number().int(),
      currentPath: z.string(),
      proposedPath: z.string(),
    }),
  ),
});

/** GET /api/library/rename-all 200 — dry-run preview. Only series with
 *  pending changes are included; nothing is written to disk. */
export const LibraryRenamePreviewResponse = z.object({
  series: z.array(LibraryRenamePreviewSeries),
  seriesChanged: z.number().int(),
  totalChanges: z.number().int().describe('Folder renames + file renames across all series.'),
});

/** POST /api/library-files/{id}/reroute 200. */
export const LibraryFileRerouteResponse = z.object({
  oldPath: z.string(),
  newPath: z.string(),
  libraryFileId: z.number().int(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Library groups — user-defined nested folders for organising series.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/library/groups request body. Omit `parentId` for a root group. */
export const LibraryGroupCreateBody = z.object({
  name: z.string().trim().min(1).max(40),
  parentId: z.number().int().positive().optional(),
});

/** PATCH /api/library/groups/{id} request body — rename and/or reparent.
 *  `parentId: null` moves the group to the root. At least one field must be
 *  present. */
export const LibraryGroupPatchBody = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    parentId: z.number().int().positive().nullable().optional(),
  })
  .refine((b) => b.name !== undefined || b.parentId !== undefined, {
    message: 'name or parentId required',
  });

/** One library group as returned by the groups CRUD endpoints. */
export const LibraryGroupRow = z.object({
  id: z.number().int(),
  name: z.string(),
  parentId: z.number().int().nullable(),
  path: z.string().describe("Display path, e.g. 'Engineering / Architecture'."),
  seriesCount: z.number().int().describe('RECURSIVE — includes subgroups.'),
  subgroupCount: z.number().int().describe('Direct children only.'),
});

/** GET /api/library/groups 200. */
export const LibraryGroupsResponse = z.object({ groups: z.array(LibraryGroupRow) });

/** DELETE /api/library/groups/{id} 200 — recursive cascade counts. */
export const LibraryGroupDeleteResponse = z.object({
  deletedGroups: z.number().int(),
  deletedSeries: z.number().int(),
});

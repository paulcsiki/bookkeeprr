import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Jobs family — request schemas are the single source of truth, used BOTH for
// runtime validation in the route handlers (app/api/jobs/**) and for the
// generated OpenAPI spec.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin-triggerable job kinds for POST /api/jobs/run. MUST stay in sync with
 * the RUNNABLE record in app/api/jobs/run/route.ts — the route's
 * `satisfies Record<RunnableJobKind, …>` clause enforces the sync at
 * compile time.
 */
export const RunnableJobKindEnum = z.enum([
  'qbt_watch',
  'import',
  'library_scan',
  'housekeeping',
]);

/** POST /api/jobs/run request body. */
export const JobRunBody = z.object({
  kind: RunnableJobKindEnum,
});

// ─────────────────────────────────────────────────────────────────────────────
// Response schemas — authored from the handlers' actual NextResponse.json
// payloads. Plain z.object (unknown keys stripped) so additive fields are
// tolerated by the test assertions.
// ─────────────────────────────────────────────────────────────────────────────

/** `jobs.status` column enum (src/server/db/schema.ts). */
export const JobStatusEnum = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'interrupted',
  'cancelled',
]);

/** A `jobs` table row as serialized to JSON (timestamps become ISO strings).
 *  Transcribed from the `jobs` table in src/server/db/schema.ts. */
export const JobRow = z.object({
  id: z.number().int(),
  kind: z
    .string()
    .describe("Job kind slug, e.g. 'library_scan', 'import', 'metadata_hydrate'."),
  status: JobStatusEnum,
  scheduledFor: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  payloadJson: z.string().describe('JSON-encoded job payload.'),
  resultJson: z.string().nullable().describe('JSON-encoded job result, set on completion.'),
  error: z.string().nullable(),
  attempt: z.number().int(),
});

/** 202 envelope for the job-enqueue endpoints (POST /api/scan,
 *  POST /api/library/health-scan, POST /api/library/rename-all) — poll
 *  `GET /api/jobs/{jobId}` until `status` is terminal. */
export const JobEnqueuedResponse = z.object({
  jobId: z.number().int(),
});

/** 409 envelope when a singleton job kind is already pending/running. */
export const JobConflictResponse = z.object({
  error: z.string(),
  existingJobId: z.number().int(),
});

/** POST /api/jobs/run 200 — `ran` = number of jobs the runner drained. */
export const JobRunResponse = z.object({
  ok: z.literal(true),
  kind: RunnableJobKindEnum,
  ran: z.number().int(),
});

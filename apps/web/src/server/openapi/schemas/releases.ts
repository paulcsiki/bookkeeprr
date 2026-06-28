import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Releases family — POST /api/releases/{id}/grab takes no body; this module
// holds the shared grab response (also returned by the interactive force-grab
// route, which keeps the status mapping in one place via _grab-helpers).
// ─────────────────────────────────────────────────────────────────────────────

/** 201 body of POST /api/releases/{id}/grab and POST /api/search/interactive/grab. */
export const ReleaseGrabResponse = z.object({
  downloadId: z.number().int(),
  qbtHash: z.string(),
  status: z.literal('queued'),
});

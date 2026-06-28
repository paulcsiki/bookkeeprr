import { z } from 'zod';
export { MessageResponse } from './common';

// ─────────────────────────────────────────────────────────────────────────────
// Quality profiles family — no request bodies/queries; everything here is a
// response schema authored from the handlers' actual NextResponse.json
// payloads.
// ─────────────────────────────────────────────────────────────────────────────

/** A `quality_profiles` table row as serialized to JSON. Transcribed from the
 *  `qualityProfiles` table in src/server/db/schema.ts. */
export const QualityProfileRow = z.object({
  id: z.number().int(),
  name: z.string(),
  preferCompleteBatches: z.boolean(),
  // JSON-encoded string arrays (e.g. '["en"]') — stored verbatim.
  preferredGroupsJson: z.string(),
  preferredLanguagesJson: z.string(),
  minSizeMb: z.number().int().nullable(),
  maxSizeMb: z.number().int().nullable(),
  preferOriginals: z.boolean(),
  isDefault: z.boolean(),
});

/** GET /api/quality-profiles 200 — the array directly (not wrapped). */
export const QualityProfilesListResponse = z.array(QualityProfileRow);

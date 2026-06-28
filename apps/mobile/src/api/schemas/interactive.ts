import { z } from 'zod';

export const InteractiveSearchRequest = z.object({
  seriesId: z.number().int().positive(),
  queryOverride: z.string().min(1).optional(),
});
export type InteractiveSearchRequest = z.infer<typeof InteractiveSearchRequest>;

export const ReleaseRow = z.object({
  releaseId: z.number().int().positive(),
  indexer: z.string(),
  title: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  seeders: z.number().int().nonnegative(),
  leechers: z.number().int().nonnegative(),
  publishedAt: z.string(),
  quality: z.string(),
  recommended: z.boolean(),
  accepted: z.boolean(),
  rejectionReason: z.string().nullable(),
  grabUrl: z.string().url().nullable(),
});
export type ReleaseRow = z.infer<typeof ReleaseRow>;

export const InteractiveSearchResponse = z.object({
  seriesId: z.number().int().positive(),
  tookMs: z.number().int().nonnegative(),
  indexerCount: z.number().int().nonnegative(),
  releases: z.array(ReleaseRow),
});
export type InteractiveSearchResponse = z.infer<typeof InteractiveSearchResponse>;

export const GrabResponse = z.object({
  downloadId: z.number().int().positive(),
  qbtHash: z.string(),
  status: z.literal('queued'),
});
export type GrabResponse = z.infer<typeof GrabResponse>;

// POST /api/series/:id/manual-grab — the user pastes their own magnet link and
// the server queues it through the normal download pipeline.
export const ManualGrabResponse = z.object({
  releaseId: z.number().int().positive(),
  downloadId: z.number().int().positive(),
});
export type ManualGrabResponse = z.infer<typeof ManualGrabResponse>;

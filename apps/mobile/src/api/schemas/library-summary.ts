import { z } from 'zod';

export const LibrarySummaryResponse = z.object({
  total: z.number().int().nonnegative(),
  monitored: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
});
export type LibrarySummaryResponse = z.infer<typeof LibrarySummaryResponse>;

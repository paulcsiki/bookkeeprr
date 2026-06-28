import { z } from 'zod';

export const VersionResponse = z.object({
  current: z.string(),
  min_supported: z.string(),
});
export type VersionResponse = z.infer<typeof VersionResponse>;

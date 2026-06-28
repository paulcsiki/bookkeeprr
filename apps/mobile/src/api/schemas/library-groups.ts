import { z } from 'zod';

export const LibraryGroup = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  parentId: z.number().int().nullable(),
  path: z.string(),
  seriesCount: z.number().int().nonnegative(),
  subgroupCount: z.number().int().nonnegative(),
});
export type LibraryGroup = z.infer<typeof LibraryGroup>;

export const LibraryGroupsResponse = z.object({
  groups: z.array(LibraryGroup),
});
export type LibraryGroupsResponse = z.infer<typeof LibraryGroupsResponse>;

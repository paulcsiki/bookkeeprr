import { z } from 'zod';

const FilelistItem = z.object({
  id: z.coerce.number().int().nonnegative(),
  name: z.string(),
  size: z.coerce.number().int().nonnegative(),
  seeders: z.coerce.number().int().nonnegative(),
  leechers: z.coerce.number().int().nonnegative(),
  category: z.coerce.number().int().nonnegative(),
  upload_date: z.string(),
  download_link: z.string(),
});

export const FilelistSearchResponse = z.array(FilelistItem);
export type FilelistItem = z.infer<typeof FilelistItem>;

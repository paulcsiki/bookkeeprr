import { z } from 'zod';

const VolumeInfo = z.object({
  title: z.string().optional(),
  authors: z.array(z.string()).optional(),
  publisher: z.string().optional(),
  publishedDate: z.string().optional(),
  description: z.string().optional(),
  pageCount: z.number().int().optional(),
  language: z.string().optional(),
  imageLinks: z
    .object({
      smallThumbnail: z.string().optional(),
      thumbnail: z.string().optional(),
      small: z.string().optional(),
      medium: z.string().optional(),
      large: z.string().optional(),
      extraLarge: z.string().optional(),
    })
    .optional(),
  industryIdentifiers: z
    .array(z.object({ type: z.string(), identifier: z.string() }))
    .optional(),
});

const Volume = z.object({
  id: z.string(),
  volumeInfo: VolumeInfo,
  accessInfo: z.object({ viewability: z.string().optional() }).optional(),
});

export const VolumesResponse = z.object({
  totalItems: z.number().int(),
  items: z.array(Volume).optional(),
});
export const VolumeResponse = Volume;
export type VolumeT = z.infer<typeof Volume>;

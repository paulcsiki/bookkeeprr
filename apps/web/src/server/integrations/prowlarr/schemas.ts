import { z } from 'zod';

const SubCategory = z.object({ id: z.union([z.string(), z.number()]) });
const Category = z.object({
  id: z.union([z.string(), z.number()]),
  subCategories: z.array(SubCategory).optional(),
});
export const ProwlarrIndexerRaw = z.object({
  id: z.number(),
  name: z.string(),
  enable: z.boolean().optional(),
  capabilities: z.object({ categories: z.array(Category).optional() }).optional(),
});
export const ProwlarrIndexerList = z.array(ProwlarrIndexerRaw);

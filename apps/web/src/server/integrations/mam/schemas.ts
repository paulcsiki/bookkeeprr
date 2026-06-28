import { z } from 'zod';

// MAM returns booleans as "0"/"1" strings (and sometimes numbers). z.coerce.boolean
// is WRONG here ("0" is truthy), so map explicitly. Undefined → false.
const mamBool = z
  .union([z.boolean(), z.number(), z.string()])
  .optional()
  .transform((v) => v === true || v === 1 || v === '1');

const MamItem = z
  .object({
    id: z.coerce.number().int().nonnegative(),
    // The API is inconsistent: some shapes use `title`, others `name`.
    title: z.string().optional(),
    name: z.string().optional(),
    size: z.coerce.number().int().nonnegative(),
    seeders: z.coerce.number().int().nonnegative().optional(),
    leechers: z.coerce.number().int().nonnegative().optional(),
    main_cat: z.coerce.number().int().optional(),
    added: z.string().optional(),
    lang_code: z.string().optional(),
    free: mamBool,
    vip: mamBool,
    fl_vip: mamBool,
    dl: z.string().optional(),
  })
  .passthrough();

export const MamSearchResponse = z
  .object({
    data: z.array(MamItem),
    total: z.coerce.number().optional(),
    total_found: z.coerce.number().optional(),
  })
  .passthrough();

export type MamItem = z.infer<typeof MamItem>;

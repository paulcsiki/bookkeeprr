import { z } from 'zod';

// fast-xml-parser with { ignoreAttributes:false, removeNSPrefix:true } folds
// <torznab:attr> to key "attr" and exposes attributes as "@_name"/"@_value".
const Attr = z.object({ '@_name': z.string(), '@_value': z.string().optional() });
const Enclosure = z.object({
  '@_url': z.string().optional(),
  '@_length': z.string().optional(),
  '@_type': z.string().optional(),
});

const Item = z.object({
  title: z.string(),
  guid: z.union([z.string(), z.object({ '#text': z.string().optional() })]).optional(),
  link: z.string().optional(),
  pubDate: z.string().optional(),
  enclosure: Enclosure.optional(),
  attr: z.union([Attr, z.array(Attr)]).optional(),
});

const Channel = z.union([
  z.object({ item: z.union([Item, z.array(Item)]).optional() }),
  z.string(),
]);

export const TorznabSearchRoot = z.object({
  rss: z.object({
    channel: Channel,
  }),
});
export type TorznabItemT = z.infer<typeof Item>;

const SubCat = z.object({ '@_id': z.union([z.string(), z.number()]), '@_name': z.string() });
const Category = z.object({
  '@_id': z.union([z.string(), z.number()]),
  '@_name': z.string(),
  subcat: z.union([SubCat, z.array(SubCat)]).optional(),
});
export const TorznabCapsRoot = z.object({
  caps: z.object({
    categories: z.object({ category: z.union([Category, z.array(Category)]).optional() }).optional(),
  }),
});

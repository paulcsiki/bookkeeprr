import { z } from 'zod';

// fast-xml-parser with removeNSPrefix:true folds <nyaa:seeders> to "seeders" key.
// XML attribute "isPermaLink" comes through as "@_isPermaLink" by default; we don't read it.
// Numbers may arrive as string or number depending on parser config — accept both via z.coerce.

const RssItem = z.object({
  title: z.string(),
  link: z.string(),
  guid: z.union([z.string(), z.object({ '#text': z.string() }).transform((o) => o['#text'])]),
  pubDate: z.string(),
  seeders: z.coerce.number().int().nonnegative(),
  leechers: z.coerce.number().int().nonnegative(),
  downloads: z.coerce.number().int().nonnegative(),
  infoHash: z.string(),
  categoryId: z.string(),
  size: z.string(),
  trusted: z.string(),
  remake: z.string(),
});

export const NyaaRssRoot = z.object({
  rss: z.object({
    channel: z.object({
      title: z.string().optional(),
      item: z.union([RssItem, z.array(RssItem), z.undefined()]).optional(),
    }),
  }),
});

export type NyaaRssItem = {
  guid: string;
  title: string;
  link: string;
  pubDate: Date;
  seeders: number;
  leechers: number;
  downloads: number;
  sizeBytes: number;
  infoHash: string;
  categoryId: string;
  trusted: boolean;
  remake: boolean;
};

// Parse "123.4 MiB" / "4.2 GiB" / "456 B" / "789 KiB" → bytes (binary multipliers)
export function parseNyaaSize(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*(B|KiB|MiB|GiB|TiB)$/i);
  if (!m || !m[1] || !m[2]) {
    throw new Error(`unparseable size: ${s}`);
  }
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult =
    unit === 'b'
      ? 1
      : unit === 'kib'
        ? 1024
        : unit === 'mib'
          ? 1024 ** 2
          : unit === 'gib'
            ? 1024 ** 3
            : 1024 ** 4;
  return Math.round(n * mult);
}

// Extract numeric ID from "https://nyaa.si/view/12345" → "12345"
export function extractGuid(s: string): string {
  const m = s.match(/\/view\/(\d+)/);
  if (m && m[1]) return m[1];
  return s;
}

import { getDb } from '@/server/db/client';
import { series } from '@/server/db/schema';
import { sql } from 'drizzle-orm';
import type { ContentType } from '@/server/content-type';

// NOTE: This membership lookup is approximate — we join by normalized title +
// content type since we don't store external source IDs in every library
// record. This means there can be false positives if two distinct works share
// a title under the same content type. A follow-up (DC2) can introduce an
// ownership index keyed on sourceId to reduce false positives.

/**
 * Returns a Set of "<contentType>::<normalizedTitle>" keys that are present
 * in the user's library (the `series` table).
 */
export async function findInLib(
  items: Array<{ title: string; contentType: ContentType }>,
): Promise<Set<string>> {
  if (items.length === 0) return new Set();

  const normalized = items.map((it) => ({
    key: `${it.contentType}::${it.title.toLowerCase().trim()}`,
    ct: it.contentType,
    norm: it.title.toLowerCase().trim(),
  }));

  const norms = [...new Set(normalized.map((n) => n.norm))];

  const rows = await getDb()
    .select({
      contentType: series.contentType,
      titleEnglish: series.titleEnglish,
      titleRomaji: series.titleRomaji,
      titleNative: series.titleNative,
    })
    .from(series)
    .where(
      sql`lower(coalesce(${series.titleEnglish}, ${series.titleRomaji}, ${series.titleNative}, '')) in (${sql.join(norms.map((n) => sql`${n}`), sql`, `)})`,
    );

  // Build a set of "<contentType>::<normalizedTitle>" from library rows.
  const owned = new Set<string>();
  for (const r of rows) {
    const titles = [r.titleEnglish, r.titleRomaji, r.titleNative].filter(Boolean) as string[];
    for (const t of titles) {
      owned.add(`${r.contentType}::${t.toLowerCase().trim()}`);
    }
  }

  return new Set(normalized.filter((n) => owned.has(n.key)).map((n) => n.key));
}

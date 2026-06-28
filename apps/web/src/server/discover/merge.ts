import type { DiscoverResult } from '@/app/api/discover/search/route';

/**
 * Normalizes a title for equality comparison: lowercases, collapses internal
 * whitespace, and strips surrounding punctuation/whitespace so that equivalent
 * titles ("  The Vinland Saga!! " vs "the vinland saga") compare equal.
 */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    // Strip leading/trailing punctuation (Unicode-aware), preserving inner text.
    .replace(/^[\s\p{P}]+/u, '')
    .replace(/[\s\p{P}]+$/u, '')
    .trim();
}

/** Count of populated (non-null/undefined/empty) scalar fields on a row. */
function richness(r: DiscoverResult): number {
  let score = 0;
  const scalars: Array<unknown> = [r.year, r.author, r.isbn, r.coverUrl, r.detail];
  for (const v of scalars) {
    if (v !== null && v !== undefined && v !== '') score++;
  }
  // Each populated source link counts — a cross-linked row is strictly richer.
  if (r.sources) {
    for (const v of Object.values(r.sources)) {
      if (v !== null && v !== undefined) score++;
    }
  }
  return score;
}

/** Shallow-merges the `sources` maps, preferring the winner's values. */
function mergeSources(
  winner: DiscoverResult,
  loser: DiscoverResult,
): DiscoverResult['sources'] {
  if (!winner.sources && !loser.sources) return undefined;
  return { ...loser.sources, ...winner.sources };
}

/**
 * Collapses rows sharing the same `contentType` + `normalizeTitle(title)`,
 * keeping the richest row (most populated fields / source links). Order is
 * stable: the first occurrence's position is preserved; merging in a later,
 * richer duplicate does not move it.
 */
export function dedupeResults(rows: DiscoverResult[]): DiscoverResult[] {
  const indexByKey = new Map<string, number>();
  const out: DiscoverResult[] = [];

  for (const row of rows) {
    const key = `${row.contentType}::${normalizeTitle(row.title)}`;
    const existingIdx = indexByKey.get(key);
    if (existingIdx === undefined) {
      indexByKey.set(key, out.length);
      out.push(row);
      continue;
    }
    const existing = out[existingIdx]!;
    // Keep the richer row in place; union their source links either way.
    if (richness(row) > richness(existing)) {
      out[existingIdx] = { ...row, sources: mergeSources(row, existing) };
    } else {
      out[existingIdx] = { ...existing, sources: mergeSources(existing, row) };
    }
  }

  return out;
}

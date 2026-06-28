import { searchNovelUpdates } from '@/server/integrations/novelupdates/client';

export type NuResolveResult =
  | { match: 'high'; slug: string; candidateTitle: string }
  | { match: 'none'; slug: null; candidateTitle: null };

export type NuResolveQuery = {
  title: string;
  altTitles: string[];
};

const THRESHOLD_HIGH = 80;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^\p{L}\p{N}]+/gu, '') // strip punctuation/whitespace, keep letters+digits
    .trim();
}

/**
 * Score a candidate NU result against the query.
 *
 * Note: NU search hits (NuSearchHit) do not currently carry aliases — only
 * NuSeriesDetail does. The helper still accepts candidateAliases so the
 * scoring stays correct if/when a caller resolves the series detail first.
 * In the current resolveNuSlug flow, candidateAliases is always [] and only
 * the title-based arms fire.
 */
function scoreCandidate(
  candidateTitle: string,
  candidateAliases: string[],
  queryTitle: string,
  queryAltTitles: string[],
): number {
  const nCandTitle = normalize(candidateTitle);
  const nCandAliases = candidateAliases.map(normalize);
  const nQueryTitle = normalize(queryTitle);
  const nQueryAlts = queryAltTitles.map(normalize);

  if (nCandTitle && nCandTitle === nQueryTitle) return 100;
  for (const alt of nQueryAlts) if (alt && alt === nCandTitle) return 100;
  for (const alias of nCandAliases) if (alias && alias === nQueryTitle) return 80;
  for (const alt of nQueryAlts) {
    for (const alias of nCandAliases) if (alias && alias === alt) return 80;
  }
  if (
    nCandTitle &&
    nQueryTitle &&
    (nCandTitle.includes(nQueryTitle) || nQueryTitle.includes(nCandTitle))
  ) {
    return 30;
  }
  return 0;
}

export async function resolveNuSlug(query: NuResolveQuery): Promise<NuResolveResult> {
  const hits = await searchNovelUpdates(query.title);
  if (hits.length === 0) {
    return { match: 'none', slug: null, candidateTitle: null };
  }
  let bestScore = -1;
  let bestHit: (typeof hits)[number] | null = null;
  for (const hit of hits) {
    const score = scoreCandidate(hit.title, [], query.title, query.altTitles);
    if (score > bestScore) {
      bestScore = score;
      bestHit = hit;
    }
  }
  if (bestHit && bestScore >= THRESHOLD_HIGH) {
    return { match: 'high', slug: bestHit.slug, candidateTitle: bestHit.title };
  }
  return { match: 'none', slug: null, candidateTitle: null };
}

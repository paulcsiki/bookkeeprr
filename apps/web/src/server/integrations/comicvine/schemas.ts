import { z } from 'zod';

export const ComicVineEnvelope = z.object({
  status_code: z.number(),
  error: z.string(),
  number_of_total_results: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  results: z.unknown(),
});

export const VolumeResult = z.object({
  id: z.number(),
  name: z.string(),
  publisher: z.object({ id: z.number(), name: z.string() }).nullable().optional(),
  start_year: z.union([z.string(), z.number(), z.null()]).optional(),
  count_of_issues: z.number().nullable().optional(),
  image: z
    .object({
      icon_url: z.string().optional(),
      small_url: z.string().optional(),
      medium_url: z.string().optional(),
      thumb_url: z.string().optional(),
    })
    .nullable()
    .optional(),
  description: z.string().nullable().optional(),
});

export const VolumeResultsArray = z.array(VolumeResult);

export const IssueResult = z.object({
  id: z.number(),
  issue_number: z.string(),
  name: z.string().nullable().optional(),
  cover_date: z.string().nullable().optional(),
  image: z
    .object({
      icon_url: z.string().optional(),
      small_url: z.string().optional(),
      medium_url: z.string().optional(),
      original_url: z.string().optional(),
      thumb_url: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export const IssueResultsArray = z.array(IssueResult);

export type ComicSearchHit = {
  comicvineId: number;
  name: string;
  publisher: string | null;
  startYear: number | null;
  issueCount: number | null;
  coverUrl: string | null;
  description: string | null;
};

export type ComicIssue = {
  comicvineIssueId: number;
  issueNumber: string;
  issueNumberSort: number;
  name: string | null;
  coverDate: string | null;
  coverUrl: string | null;
};

export function mapVolume(raw: z.infer<typeof VolumeResult>): ComicSearchHit {
  const startYear =
    raw.start_year === null || raw.start_year === undefined
      ? null
      : typeof raw.start_year === 'number'
        ? raw.start_year
        : (() => {
            const n = parseInt(raw.start_year, 10);
            return Number.isFinite(n) ? n : null;
          })();
  return {
    comicvineId: raw.id,
    name: raw.name,
    publisher: raw.publisher?.name ?? null,
    startYear,
    issueCount: raw.count_of_issues ?? null,
    coverUrl: raw.image?.small_url ?? raw.image?.medium_url ?? null,
    description: raw.description ?? null,
  };
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Pick the ComicVine volume that best matches a manga/comic series so we can
 * mine its per-issue covers. Requires an exact normalized-title match (avoids
 * picking a spin-off), then prefers the English VIZ edition, then an exact
 * issue-count match against the known volume total, then the most issues.
 * Returns null when nothing matches by title.
 */
export function pickComicVineVolume(
  hits: ComicSearchHit[],
  seriesTitle: string,
  totalVolumes: number | null,
): ComicSearchHit | null {
  const want = normalizeTitle(seriesTitle);
  const named = hits.filter((h) => normalizeTitle(h.name) === want);
  if (named.length === 0) return null;
  const viz = named.filter((h) => /viz/i.test(h.publisher ?? ''));
  const pool = viz.length > 0 ? viz : named;
  if (totalVolumes && totalVolumes > 0) {
    const exact = pool.filter((h) => h.issueCount === totalVolumes);
    if (exact.length > 0) return exact[0]!;
  }
  return pool.slice().sort((a, b) => (b.issueCount ?? 0) - (a.issueCount ?? 0))[0]!;
}

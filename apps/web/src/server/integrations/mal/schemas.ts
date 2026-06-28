import { z } from 'zod';

// ---------------------------------------------------------------------------
// Raw MAL API v2 shapes (tolerant — most fields are optional)
// ---------------------------------------------------------------------------

export const MalAlternativeTitles = z.object({
  synonyms: z.array(z.string()).nullable().optional(),
  en: z.string().nullable().optional(),
  ja: z.string().nullable().optional(),
});

export const MalMainPicture = z.object({
  medium: z.string().nullable().optional(),
  large: z.string().nullable().optional(),
});

export const MalMangaNode = z.object({
  id: z.number().int(),
  title: z.string(),
  alternative_titles: MalAlternativeTitles.nullable().optional(),
  main_picture: MalMainPicture.nullable().optional(),
  synopsis: z.string().nullable().optional(),
  // 0 means "unknown" in MAL's data.
  num_volumes: z.number().int().nullable().optional(),
  num_chapters: z.number().int().nullable().optional(),
  status: z.string().nullable().optional(),
  media_type: z.string().nullable().optional(),
  // 'YYYY' or 'YYYY-MM-DD' (or 'YYYY-MM').
  start_date: z.string().nullable().optional(),
});

export type MalMangaNodeT = z.infer<typeof MalMangaNode>;

// Search returns { data: [ { node } ], paging }.
export const MalSearchResponse = z.object({
  data: z.array(z.object({ node: MalMangaNode })),
  paging: z.unknown().optional(),
});

// Detail returns the node object directly.
export const MalMangaDetailResponse = MalMangaNode;

// ---------------------------------------------------------------------------
// Domain-mapped types (what the rest of the app consumes)
// ---------------------------------------------------------------------------

export type MalStatus = 'releasing' | 'finished' | 'hiatus' | 'cancelled';

/**
 * Every known title for a MAL manga, kept separate so a later cross-link helper
 * can match any permutation against AniList's title set.
 */
export type MalTitles = {
  /** MAL's primary `title` (usually romaji). */
  main: string;
  /** `alternative_titles.en`. */
  en: string | null;
  /** `alternative_titles.ja` (native). */
  ja: string | null;
  /** `alternative_titles.synonyms`. */
  synonyms: string[];
  /** Flat, de-duplicated list of every non-empty title above (for matching). */
  all: string[];
};

export type MalMangaHit = {
  source: 'mal';
  malId: number;
  /** Primary display title (MAL's `title`). */
  title: string;
  /** All known titles, for cross-source matching. */
  titles: MalTitles;
  coverUrl: string | null;
  status: MalStatus;
  /** null when MAL reports 0 (unknown) or omits it. */
  totalVolumes: number | null;
  /** null when MAL reports 0 (unknown) or omits it. */
  totalChapters: number | null;
  /** Parsed from `start_date`. */
  year: number | null;
  mediaType: string | null;
};

export type MalMangaDetail = MalMangaHit & {
  synopsis: string | null;
};

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * MAL manga publication status → bookkeeprr's status vocabulary.
 *
 * finished → finished, currently_publishing → releasing,
 * not_yet_published → releasing, on_hiatus → hiatus,
 * discontinued → cancelled, everything else → releasing.
 */
export function mapMalStatus(raw: string | null | undefined): MalStatus {
  switch (raw) {
    case 'finished':
      return 'finished';
    case 'currently_publishing':
      return 'releasing';
    case 'not_yet_published':
      return 'releasing';
    case 'on_hiatus':
      return 'hiatus';
    case 'discontinued':
      return 'cancelled';
    default:
      return 'releasing';
  }
}

/** Leading 4-digit year out of 'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD'. */
export function parseMalYear(startDate: string | null | undefined): number | null {
  if (!startDate) return null;
  const m = startDate.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** MAL uses 0 to mean "unknown" for volume/chapter counts. */
function normalizeCount(n: number | null | undefined): number | null {
  if (n === null || n === undefined || n === 0) return null;
  return n;
}

export function collectMalTitles(node: MalMangaNodeT): MalTitles {
  const alt = node.alternative_titles ?? undefined;
  const en = alt?.en?.trim() ? alt.en : null;
  const ja = alt?.ja?.trim() ? alt.ja : null;
  const synonyms = (alt?.synonyms ?? []).filter((s): s is string => !!s && s.trim().length > 0);

  const all: string[] = [];
  const seen = new Set<string>();
  for (const t of [node.title, en, ja, ...synonyms]) {
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(t);
  }

  return { main: node.title, en, ja, synonyms, all };
}

export function mapMalManga(node: MalMangaNodeT): MalMangaHit {
  return {
    source: 'mal',
    malId: node.id,
    title: node.title,
    titles: collectMalTitles(node),
    coverUrl: node.main_picture?.large ?? node.main_picture?.medium ?? null,
    status: mapMalStatus(node.status),
    totalVolumes: normalizeCount(node.num_volumes),
    totalChapters: normalizeCount(node.num_chapters),
    year: parseMalYear(node.start_date),
    mediaType: node.media_type ?? null,
  };
}

export function mapMalMangaDetail(node: MalMangaNodeT): MalMangaDetail {
  return {
    ...mapMalManga(node),
    synopsis: node.synopsis ?? null,
  };
}

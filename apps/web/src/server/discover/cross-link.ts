import type { SearchHit } from '@/server/integrations/anilist/schemas';
import type { MalMangaHit } from '@/server/integrations/mal/schemas';
import { normalizeTitle } from '@/server/discover/merge';

/**
 * A manga search hit potentially merged from AniList and/or MyAnimeList. When a
 * hit is present on both sources, AniList is the display primary (its
 * title/cover/status/year win); the MAL id is retained so the add flow can store
 * the cross-link. The `sources` array records which provider(s) contributed.
 *
 * Note on the AniList input: the real domain type is `SearchHit`
 * (`@/server/integrations/anilist/schemas`). It exposes no `synonyms` and no
 * volume/chapter counts, so a linked (AniList-primary) hit reports
 * `totalVolumes`/`totalChapters` as null — those are filled in later by the
 * detail fetch, not by borrowing from the linked MAL hit. MAL-only hits carry
 * MAL's counts.
 */
export type MergedMangaHit = {
  anilistId: number | null;
  malId: number | null;
  /** Which source(s) this hit came from. */
  sources: ('anilist' | 'mal')[];
  // Display fields (AniList preferred when linked):
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  coverUrl: string | null;
  status: 'releasing' | 'finished' | 'hiatus' | 'cancelled';
  totalVolumes: number | null;
  totalChapters: number | null;
  year: number | null;
};

/** Normalized, de-duplicated, non-empty title set used for cross-source matching. */
function normalizedTitleSet(titles: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const t of titles) {
    if (!t) continue;
    const n = normalizeTitle(t);
    if (n.length > 0) set.add(n);
  }
  return set;
}

function anilistTitleSet(hit: SearchHit): Set<string> {
  // SearchHit exposes english/romaji/native only — no synonyms field.
  return normalizedTitleSet([hit.titleEnglish, hit.titleRomaji, hit.titleNative]);
}

function malTitleSet(hit: MalMangaHit): Set<string> {
  // `titles.all` already includes main/en/ja/synonyms, de-duplicated.
  return normalizedTitleSet(hit.titles.all);
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function fromAniList(hit: SearchHit, mal: MalMangaHit | null): MergedMangaHit {
  return {
    anilistId: hit.anilistId,
    malId: mal ? mal.malId : null,
    sources: mal ? ['anilist', 'mal'] : ['anilist'],
    titleEnglish: hit.titleEnglish,
    titleRomaji: hit.titleRomaji,
    titleNative: hit.titleNative,
    coverUrl: hit.coverUrl,
    status: hit.status,
    // AniList SearchHit carries no counts; AniList is the display primary.
    totalVolumes: null,
    totalChapters: null,
    year: hit.startYear,
  };
}

function fromMal(hit: MalMangaHit): MergedMangaHit {
  return {
    anilistId: null,
    malId: hit.malId,
    sources: ['mal'],
    titleEnglish: hit.titles.en,
    titleRomaji: hit.titles.main,
    titleNative: hit.titles.ja,
    coverUrl: hit.coverUrl,
    status: hit.status,
    totalVolumes: hit.totalVolumes,
    totalChapters: hit.totalChapters,
    year: hit.year,
  };
}

/**
 * Merges AniList and MAL manga search hits, cross-linking entries that share any
 * normalized title (full cross-product over both title sets). Each MAL hit links
 * to at most one AniList hit (first match in AniList input order wins) and a
 * linked MAL hit is not emitted standalone.
 *
 * Output order: every AniList hit first (input order, AniList-primary display),
 * then the MAL-only hits (input order).
 */
export function crossLinkHits(
  anilistHits: SearchHit[],
  malHits: MalMangaHit[],
): MergedMangaHit[] {
  const anilistSets = anilistHits.map(anilistTitleSet);
  const malSets = malHits.map(malTitleSet);

  // For each MAL hit, find the first AniList hit it shares a title with.
  const malLinkedTo: (number | null)[] = malHits.map((_, mi) => {
    for (let ai = 0; ai < anilistHits.length; ai++) {
      if (intersects(anilistSets[ai]!, malSets[mi]!)) return ai;
    }
    return null;
  });

  // For each AniList hit, the first MAL hit that linked to it (first wins).
  const anilistLinkedMal: (number | null)[] = anilistHits.map(() => null);
  for (let mi = 0; mi < malHits.length; mi++) {
    const ai = malLinkedTo[mi]!;
    if (ai !== null && anilistLinkedMal[ai] === null) {
      anilistLinkedMal[ai] = mi;
    }
  }

  const out: MergedMangaHit[] = [];

  // AniList hits first, in input order.
  for (let ai = 0; ai < anilistHits.length; ai++) {
    const mi = anilistLinkedMal[ai]!;
    out.push(fromAniList(anilistHits[ai]!, mi !== null ? malHits[mi]! : null));
  }

  // Then MAL-only hits: any MAL hit that linked to an AniList hit (even one
  // already claimed by an earlier MAL hit) is considered merged and is not
  // emitted standalone.
  for (let mi = 0; mi < malHits.length; mi++) {
    if (malLinkedTo[mi]! !== null) continue;
    out.push(fromMal(malHits[mi]!));
  }

  return out;
}

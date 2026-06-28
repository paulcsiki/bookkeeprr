import { tokenize, tokensExcludingQualifiers } from '@/server/parser/tokens';
import type { ParsedRelease } from '@/server/parser/release';
import type { SeriesRow } from '@/server/db/schema';
import type { ContentType } from '@/server/content-type';

// Book-like content types name releases with the title PLUS a subtitle, the
// author, the format and often the publisher — e.g.
// "Atomic.Habits.An.Easy.&.Proven.Way...by.James.Clear". Exact token-set
// equality can never match those, so for these we match by containment instead.
// Manga/comic keep strict equality, where "Berserk" must NOT match
// "Berserk of Gluttony".
const BOOK_CONTENT_TYPES: ReadonlySet<ContentType> = new Set<ContentType>([
  'ebook',
  'audiobook',
  'light_novel',
]);

function parseExtraTerms(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function setEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const x of b) if (!setA.has(x)) return false;
  return true;
}

/** True when every token in `needles` is present in `haystack` (needles ⊆ haystack). */
function isSubset(needles: string[], haystack: Set<string>): boolean {
  return needles.length > 0 && needles.every((t) => haystack.has(t));
}

/** Drop a leading run of author tokens from the release's ordered tokens, so
 *  "E L James - Grey" → ["grey"] before the prefix check. */
function dropLeadingAuthor(releaseOrdered: string[], authorTokens: string[]): string[] {
  if (authorTokens.length === 0) return releaseOrdered;
  let i = 0;
  const authorSet = new Set(authorTokens);
  while (i < releaseOrdered.length && authorSet.has(releaseOrdered[i]!)) i++;
  return releaseOrdered.slice(i);
}

/** True when `needles` is an in-order prefix of `haystack` (haystack[0..k] === needles). */
function isPrefix(needles: string[], haystack: string[]): boolean {
  if (needles.length === 0 || needles.length > haystack.length) return false;
  for (let i = 0; i < needles.length; i++) if (haystack[i] !== needles[i]) return false;
  return true;
}

/**
 * Token variants for a title: the full title, plus a variant with parenthetical
 * / bracketed segments removed. A collection name in parens — e.g.
 * "The Fellowship of the Ring (Lord of the Rings)" — shouldn't force every
 * release to also contain "lord rings".
 */
function titleVariants(title: string): string[][] {
  const variants = [tokensExcludingQualifiers(tokenize(title))];
  const stripped = title.replace(/[([{][^)\]}]*[)\]}]/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripped.length > 0 && stripped !== title) {
    variants.push(tokensExcludingQualifiers(tokenize(stripped)));
  }
  return variants;
}

export function titleMatches(
  parsed: ParsedRelease,
  series: SeriesRow,
  opts?: { requireAuthor?: boolean },
): boolean {
  const releaseCore = tokensExcludingQualifiers(tokenize(parsed.cleanTitle));
  if (releaseCore.length === 0) return false;

  const titleCandidates: string[][] = [];
  if (series.titleEnglish) titleCandidates.push(...titleVariants(series.titleEnglish));
  if (series.titleRomaji) titleCandidates.push(...titleVariants(series.titleRomaji));
  if (series.titleNative) titleCandidates.push(...titleVariants(series.titleNative));

  const extraTermCandidates = parseExtraTerms(series.extraSearchTermsJson).map((term) =>
    tokensExcludingQualifiers(tokenize(term)),
  );
  const authorTokens = series.author ? tokensExcludingQualifiers(tokenize(series.author)) : [];

  // Book-like releases: match by prefix-anchoring so a short title like "Grey"
  // does NOT match "Fifty Shades of Grey Trilogy". The series title must LEAD
  // the release title (after any leading author run is dropped); subtitles after
  // it are fine, but a longer different book that merely *contains* the series
  // title is rejected. When the author is known, require it too — that guards
  // against same-title / different-author collisions without forcing an exact set.
  // Audiobooks are the exception: narrator-led release names routinely drop the
  // author (and lead with the narrator), so requiring the author starves the
  // match. The title-prefix check alone is enough signal there.
  if (BOOK_CONTENT_TYPES.has(series.contentType as ContentType)) {
    const releaseSet = new Set(releaseCore);
    // Callers that match against names which never carry the author (e.g. the
    // library-import scanner, whose filenames hold publisher/group tags but not
    // the author) opt out via { requireAuthor: false }; the release matcher keeps
    // the default (author required) to guard same-title/different-author clashes.
    const requireAuthor =
      (opts?.requireAuthor ?? true) && (series.contentType as ContentType) !== 'audiobook';
    const authorOk =
      !requireAuthor || authorTokens.length === 0 || isSubset(authorTokens, releaseSet);
    if (authorOk) {
      const anchored = dropLeadingAuthor(releaseCore, authorTokens);
      for (const c of titleCandidates) {
        // Prefix-anchored: the series title must lead the release title (subtitles
        // after it are fine); a longer different book that merely *contains* the
        // series title (e.g. "Fifty Shades of Grey" for series "Grey") is rejected.
        // Two checks, both load-bearing: `anchored` handles author-led releases
        // ("E L James - Grey"); the `releaseCore` fallback covers the case where
        // dropLeadingAuthor over-strips because a title token coincides with an
        // author-name token (author "James Clear", title "Clear Blue Sky" — "clear"
        // gets stripped from the front of anchored).
        if (isPrefix(c, anchored) || isPrefix(c, releaseCore)) return true;
      }
    }
    // Explicit user/alias search terms still match by containment.
    for (const c of extraTermCandidates) {
      if (isSubset(c, releaseSet)) return true;
    }
    return false;
  }

  // Manga/comic: strict set-equality. A "title + author" candidate is added so
  // scene book-style names (title PLUS author, no subtitle) still work without
  // loosening to bare containment.
  const candidates: string[][] = [...titleCandidates, ...extraTermCandidates];
  if (authorTokens.length > 0) {
    for (const t of titleCandidates) {
      candidates.push([...new Set([...t, ...authorTokens])]);
    }
  }

  for (const c of candidates) {
    if (c.length === 0) continue;
    if (setEquals(c, releaseCore)) return true;
  }
  return false;
}

import type { ParsedRelease } from '@/server/parser/release';
import type { SeriesRow, QualityProfileRow } from '@/server/db/schema';
import type { IndexerResult } from '@/server/integrations/indexers/types';
import type { ScoringWeights, AdultFilter } from '@/server/db/settings/matcher';
import { DEFAULT_WEIGHTS } from '@/server/db/settings/matcher';
import { logger } from '@/server/logger';
import { titleMatches } from './titles';
import { scoreRelease } from './score';

export type MatchInput = {
  parsed: ParsedRelease;
  series: SeriesRow;
  profile: QualityProfileRow;
  raw: IndexerResult;
  /**
   * Set when this release already exists in the DB and has been permanently
   * blacklisted (bad content / wrong format). When non-null the matcher rejects
   * it outright so replays and searches never re-surface a known-bad release.
   * Discovery callers pass the existing row's `rejectedAt`; undefined/null means
   * "not (yet) known to be rejected".
   */
  rejectedAt?: Date | null;
  /**
   * DB id of the release row, when known (e.g. the existing row at re-discovery).
   * Optional — new releases that haven't been upserted yet won't have an id.
   * Used only for structured warn-logging; never affects match logic.
   */
  releaseId?: number | null;
};

export type MatchOpts = {
  weights?: ScoringWeights;
  adultFilter?: AdultFilter | null;
};

export type MatchResult =
  | {
      matches: false;
      reason:
        | 'title-mismatch'
        | 'granularity-mismatch'
        | 'content-type-mismatch'
        | 'language'
        | 'size'
        | 'insufficient-seeders'
        | 'adult-filter'
        | 'rejected';
    }
  | { matches: true; score: number };

// An ebook/light-novel release above this size is almost certainly an audiobook
// (or audio+ebook combo) rather than a text file. Generous enough for large
// illustrated PDFs; audiobooks are typically several hundred MiB to GiB.
const TEXT_MAX_PLAUSIBLE_BYTES = 120 * 1024 * 1024;

/** Map a series contentType to a broad family used for cross-type rejection. */
function contentTypeFamily(contentType: string): 'comic' | 'prose' | 'audio' | null {
  if (contentType === 'manga' || contentType === 'comic') return 'comic';
  if (contentType === 'light_novel' || contentType === 'ebook') return 'prose';
  if (contentType === 'audiobook') return 'audio';
  return null;
}

const matcherLog = () => logger().child({ component: 'matcher' });

export function matchRelease(input: MatchInput, opts: MatchOpts = {}): MatchResult {
  const { parsed, series, profile, raw } = input;

  // Helper: emit a warn log and return a rejection. Used for every rejection
  // path so operators can correlate pre-grab rejections in the log.
  function reject(reason: MatchResult & { matches: false }): MatchResult & { matches: false } {
    matcherLog().warn(
      {
        releaseId: input.releaseId ?? null,
        seriesId: series.id,
        title: raw.title,
        seriesContentType: series.contentType,
        hint: parsed.contentTypeHint,
        reason: reason.reason,
      },
      'bad release rejected (pre-grab)',
    );
    return reason;
  }

  // Permanently blacklisted releases are never re-surfaced: replays and searches
  // skip them so auto-grab can fall through to the next-best candidate.
  if (input.rejectedAt != null) {
    return reject({ matches: false, reason: 'rejected' });
  }

  if (!titleMatches(parsed, series)) {
    return reject({ matches: false, reason: 'title-mismatch' });
  }

  // Reject an EXPLICIT cross-content-type release. Only fires when the release
  // carries a concrete hint (e.g. "manhwa") AND the series has a known family
  // AND they conflict. Untagged releases (hint === null) are always allowed.
  if (parsed.contentTypeHint !== null) {
    const seriesFamily = contentTypeFamily(series.contentType);
    if (seriesFamily !== null && parsed.contentTypeHint !== seriesFamily) {
      return reject({ matches: false, reason: 'content-type-mismatch' });
    }
  }

  // Size sanity for text (ebook / light novel): combo packs and mislabelled
  // audiobooks (e.g. a FileList "Books" item that's really an .mp3 set) carry no
  // audiobook keyword in the title, so the hint check above can't catch them. A
  // text release in the hundreds-of-MiB range is almost certainly an audiobook —
  // unless it's explicitly tagged as an ebook/novel. Reject those.
  if (
    contentTypeFamily(series.contentType) === 'prose' &&
    parsed.contentTypeHint !== 'prose' &&
    raw.sizeBytes > TEXT_MAX_PLAUSIBLE_BYTES
  ) {
    return reject({ matches: false, reason: 'content-type-mismatch' });
  }

  if (series.granularity === 'volume') {
    // Reject only a *concretely parsed* chapter release (an actual c<N> / #<N>
    // unit). The parser falls back to targetKind 'chapter' with a null unit for
    // any title it can't decode — e.g. a complete publisher pack like
    // "Solo Leveling (Novel) [Yen Press]" whose volume numbers live only in the
    // files inside. Those are whole-series grabs, not chapter releases, so they
    // must stay matchable for a volume series (force-grab; the importer creates
    // volumes from the files). Auto-grab still ignores them — decideGrabs only
    // acts on releases with a concrete range.
    if (parsed.targetKind === 'chapter' && parsed.targetLow !== null) {
      return reject({ matches: false, reason: 'granularity-mismatch' });
    }
  } else {
    if (parsed.targetKind === 'volume') {
      return reject({ matches: false, reason: 'granularity-mismatch' });
    }
  }

  const effectiveLanguage = parsed.language ?? 'en';
  const preferredLanguages: string[] = (() => {
    try {
      const v = JSON.parse(profile.preferredLanguagesJson);
      return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
    } catch {
      return [];
    }
  })();
  if (preferredLanguages.length > 0 && !preferredLanguages.includes(effectiveLanguage)) {
    return reject({ matches: false, reason: 'language' });
  }
  const sizeMb = raw.sizeBytes / (1024 * 1024);
  if (profile.minSizeMb !== null && profile.minSizeMb !== undefined && sizeMb < profile.minSizeMb) {
    return reject({ matches: false, reason: 'size' });
  }
  if (profile.maxSizeMb !== null && profile.maxSizeMb !== undefined && sizeMb > profile.maxSizeMb) {
    return reject({ matches: false, reason: 'size' });
  }

  // Swarm-health floor: a release below the configured minimum seeder count is
  // a dead/dying torrent that would stall rather than complete. Reject it here
  // so auto-grab never queues it (and the failover never cycles through them).
  // minSeeders rides in via the weights bag; 0 disables the filter.
  const minSeeders = opts.weights?.minSeeders ?? DEFAULT_WEIGHTS.minSeeders;
  if (minSeeders > 0 && raw.seeders < minSeeders) {
    return reject({ matches: false, reason: 'insufficient-seeders' });
  }

  const score = scoreRelease(parsed, profile, raw, opts.weights, opts.adultFilter ?? null);
  if (score === null) {
    // Adult filter (or, defensively, any other null-return path from scoreRelease) blocked.
    return reject({ matches: false, reason: 'adult-filter' });
  }
  return { matches: true, score };
}

export { titleMatches } from './titles';
export { scoreRelease } from './score';

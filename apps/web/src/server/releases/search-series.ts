import {
  updateIndexerLastRssAt,
  parseIndexerConfig,
  type IndexerKind,
  type IndexerConfig,
} from '@/server/db/indexers';
import type { IndexerRow, SeriesRow } from '@/server/db/schema';
import { searchIndexer } from '@/server/integrations/indexers';
import { NyaaError } from '@/server/integrations/nyaa';
import { FilelistError } from '@/server/integrations/filelist';
import { parseReleaseTitle, refineForSeries } from '@/server/parser/release';
import { matchRelease, type MatchOpts } from '@/server/matcher';
import { upsertReleaseByGuid, findReleaseByIndexerGuid } from '@/server/db/releases';
import { getQualityProfile } from '@/server/db/quality-profiles';
import { buildQuery } from '@/server/jobs/kinds/indexer-poll';
import { logger } from '@/server/logger';

function indexerErrorMessage(err: unknown, kind: IndexerKind): string {
  if (err instanceof NyaaError) return `nyaa: ${err.message}`;
  if (err instanceof FilelistError) return `filelist: ${err.message}`;
  return `${kind}: ${(err as Error).message}`;
}

/**
 * Scoring options for a series search: the matcher's second-arg shape
 * (`{ weights, adultFilter }`). Mirrors {@link matchRelease}'s `MatchOpts`.
 */
export type SeriesSearchScoring = MatchOpts;

export type SeriesSearchResult = {
  upserted: number;
  errors: { message: string }[];
  /** True when the series was skipped before any indexer search (no quality
   * profile). Callers use this to mirror missing_search's "don't count it as
   * polled" behavior. */
  skippedNoProfile: boolean;
};

/**
 * Search every enabled indexer for a single series and upsert matching releases.
 * Returns the number upserted plus any per-indexer error messages. Per-indexer
 * errors are logged and collected (never thrown), mirroring missing_search.
 */
export async function searchReleasesForSeries(
  series: SeriesRow,
  indexerRows: IndexerRow[],
  scoring: SeriesSearchScoring,
): Promise<SeriesSearchResult> {
  const log = logger().child({ component: 'search_releases_for_series', seriesId: series.id });
  const errors: { message: string }[] = [];
  let upserted = 0;

  const profile = await getQualityProfile(series.qualityProfileId);
  if (!profile) return { upserted, errors: [{ message: 'profile not found' }], skippedNoProfile: true };

  for (const indexer of indexerRows) {
    const kind = indexer.kind as IndexerKind;
    const cfg: IndexerConfig = parseIndexerConfig(indexer.configJson, kind);
    if (!cfg.contentTypes.includes(series.contentType)) continue;
    const category = cfg.categoryByContentType[series.contentType];
    if (category == null) continue;
    const q = buildQuery(series, cfg);
    if (q.length === 0) continue;
    try {
      const items = await searchIndexer(indexer, cfg, { q, category });
      for (const item of items) {
        const parsed = refineForSeries(parseReleaseTitle(item.title), {
          granularity: series.granularity,
          totalVolumes: series.totalVolumes,
        });
        const existing = await findReleaseByIndexerGuid(indexer.id, item.guid);
        const r = matchRelease(
          { parsed, series, profile, raw: item, rejectedAt: existing?.rejectedAt ?? null },
          scoring,
        );
        if (!r.matches) continue;
        await upsertReleaseByGuid({
          indexerId: indexer.id,
          indexerGuid: item.guid,
          seriesId: series.id,
          title: item.title,
          link: item.link,
          targetKind: parsed.targetKind,
          targetLow: parsed.targetLow,
          targetHigh: parsed.targetHigh,
          groupName: parsed.group,
          language: parsed.language,
          sizeBytes: item.sizeBytes,
          seeders: item.seeders,
          leechers: item.leechers,
          publishedAt: item.pubDate,
          score: r.score,
        });
        upserted++;
      }
      await updateIndexerLastRssAt(indexer.id, new Date());
    } catch (err) {
      const message = indexerErrorMessage(err, kind);
      log.warn({ indexerId: indexer.id, err: message }, 'per-indexer error; continuing');
      errors.push({ message });
    }
  }
  return { upserted, errors, skippedNoProfile: false };
}

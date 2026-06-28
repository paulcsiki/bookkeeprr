import { z } from 'zod';
import { searchIndexer } from '@/server/integrations/indexers';
import { NyaaError } from '@/server/integrations/nyaa';
import { FilelistError } from '@/server/integrations/filelist';
import { parseReleaseTitle, refineForSeries } from '@/server/parser/release';
import { matchRelease } from '@/server/matcher';
import {
  getIndexer,
  updateIndexerLastRssAt,
  parseIndexerConfig,
  isManualOnlyIndexer,
  type IndexerKind,
} from '@/server/db/indexers';
import { listMonitoredSeries } from '@/server/db/series';
import { upsertReleaseByGuid, findReleaseByIndexerGuid } from '@/server/db/releases';
import { getQualityProfile } from '@/server/db/quality-profiles';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';
import type { SeriesRow } from '@/server/db/schema';
import type { IndexerConfig } from '@/server/integrations/indexers/types';
import { runAutoGrabForSeries } from '@/server/auto-grab/run';
import { scoringWeightsSetting, adultFilterSetting } from '@/server/db/settings/matcher';

const Payload = z.object({ indexerId: z.number().int().positive() });

type Result = {
  indexerId: number;
  seriesProcessed: number;
  releasesUpserted: number;
  errors: { seriesId: number; message: string }[];
};

function firstTitle(s: SeriesRow): string | null {
  return s.titleEnglish ?? s.titleRomaji ?? s.titleNative;
}

function parseExtraSearchTerms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function applyTemplate(cfg: IndexerConfig, title: string, extras: string): string {
  return cfg.queryTemplate
    .replaceAll('{title}', title)
    .replaceAll('{extra}', extras)
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildQuery(s: SeriesRow, cfg: IndexerConfig): string {
  const extras = parseExtraSearchTerms(s.extraSearchTermsJson).join(' ');
  return applyTemplate(cfg, firstTitle(s) ?? '', extras);
}

/**
 * One query per distinct known title (English, romaji, native). Interactive
 * search runs all of them and merges results — Sonarr-style — so a release
 * listed under the Japanese title is still found. Background polling stays on the
 * single {@link buildQuery} to avoid hammering indexers.
 */
export function buildQueries(s: SeriesRow, cfg: IndexerConfig): string[] {
  const extras = parseExtraSearchTerms(s.extraSearchTermsJson).join(' ');
  const titles = [s.titleEnglish, s.titleRomaji, s.titleNative].filter(
    (t): t is string => Boolean(t && t.trim()),
  );
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const title of titles) {
    const q = applyTemplate(cfg, title, extras);
    if (q.length > 0 && !seen.has(q)) {
      seen.add(q);
      queries.push(q);
    }
  }
  return queries;
}

function indexerErrorMessage(err: unknown, kind: IndexerKind): string {
  if (err instanceof NyaaError) return `nyaa: ${err.message}`;
  if (err instanceof FilelistError) return `filelist: ${err.message}`;
  return `${kind}: ${(err as Error).message}`;
}

export const indexerPollDescriptor: JobKindDescriptor<{ indexerId: number }, Result> = {
  kind: 'indexer_poll',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (rawPayload) => {
    const log = logger().child({ component: 'indexer_poll' });
    const { indexerId } = Payload.parse(rawPayload);
    const errors: Result['errors'] = [];
    let seriesProcessed = 0;
    let releasesUpserted = 0;

    const indexer = await getIndexer(indexerId);
    if (!indexer || !indexer.enabled) {
      return { indexerId, seriesProcessed, releasesUpserted, errors };
    }
    const kind = indexer.kind as IndexerKind;
    if (isManualOnlyIndexer(kind)) {
      // MAM is interactive-search-only — never polled.
      return { indexerId, seriesProcessed, releasesUpserted, errors };
    }
    const cfg = parseIndexerConfig(indexer.configJson, kind);

    const [weights, adultFilter] = await Promise.all([
      scoringWeightsSetting.get(),
      adultFilterSetting.get(),
    ]);

    const monitored = await listMonitoredSeries(['all', 'future', 'missing']);

    for (const s of monitored) {
      seriesProcessed++;
      let upsertsForThisSeries = 0;
      try {
        if (!cfg.contentTypes.includes(s.contentType)) continue;
        const category = cfg.categoryByContentType[s.contentType];
        if (category == null) continue;

        const profile = await getQualityProfile(s.qualityProfileId);
        if (!profile) {
          errors.push({ seriesId: s.id, message: 'profile not found' });
          continue;
        }
        const q = buildQuery(s, cfg);
        if (q.length === 0) {
          errors.push({ seriesId: s.id, message: 'empty query' });
          continue;
        }
        const items = await searchIndexer(indexer, cfg, { q, category });
        for (const item of items) {
          const parsed = refineForSeries(parseReleaseTitle(item.title), { granularity: s.granularity, totalVolumes: s.totalVolumes });
          const existing = await findReleaseByIndexerGuid(indexerId, item.guid);
          const r = matchRelease(
            { parsed, series: s, profile, raw: item, rejectedAt: existing?.rejectedAt ?? null },
            { weights, adultFilter },
          );
          if (!r.matches) continue;
          await upsertReleaseByGuid({
            indexerId,
            indexerGuid: item.guid,
            seriesId: s.id,
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
            trusted: item.trusted ?? null,
            remake: item.remake ?? null,
          });
          releasesUpserted++;
          upsertsForThisSeries++;
        }
        if (upsertsForThisSeries > 0) {
          const ag = await runAutoGrabForSeries(s);
          log.info({ seriesId: s.id, autoGrab: ag }, 'auto-grab cycle complete');
        }
      } catch (err) {
        const message = indexerErrorMessage(err, kind);
        log.warn({ seriesId: s.id, err: message }, 'per-series error; continuing');
        errors.push({ seriesId: s.id, message });
      }
    }

    await updateIndexerLastRssAt(indexerId, new Date());

    return { indexerId, seriesProcessed, releasesUpserted, errors };
  },
};

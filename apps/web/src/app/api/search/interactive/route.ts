import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { libraryFiles, volumes, chapters } from '@/server/db/schema';
import { getSeries } from '@/server/db/series';
import { getQualityProfile } from '@/server/db/quality-profiles';
import { listEnabledIndexers, parseIndexerConfig, type IndexerConfig } from '@/server/db/indexers';
import {
  searchIndexer,
  buildIndexerInfoUrl,
  type IndexerResult,
  type IndexerKind,
} from '@/server/integrations/indexers';
import { parseReleaseTitle, refineForSeries, type ParsedRelease } from '@/server/parser/release';
import { matchRelease, type MatchResult } from '@/server/matcher';
import { upsertReleaseByGuid, findReleaseByIndexerGuid } from '@/server/db/releases';
import { listDownloadsForReleaseIds } from '@/server/db/downloads';
import { buildQueries } from '@/server/jobs/kinds/indexer-poll';
import { logger } from '@/server/logger';
import { scoringWeightsSetting, adultFilterSetting } from '@/server/db/settings/matcher';
import { InteractiveSearchBody } from '@/server/openapi/schemas/search';

type Ownership = 'none' | 'in-library' | 'downloading';

type InteractiveSearchResult = {
  item: {
    guid: string;
    title: string;
    link: string;
    seeders: number;
    leechers: number;
    sizeBytes: number;
    publishedAt: string;
    indexerId: number;
    indexerName: string;
    indexerKind: string;
    infoUrl: string | null;
    freeleech: boolean;
    vip: boolean;
  };
  parsed: ParsedRelease;
  matchResult: MatchResult;
  ownership: Ownership;
  releaseId: number | null;
};

function parseCfg(raw: string, kind: IndexerKind): IndexerConfig {
  return parseIndexerConfig(raw, kind);
}

function computeOwnership(
  parsed: ParsedRelease,
  granularity: 'volume' | 'chapter',
  ownedVolumes: Set<number>,
  ownedChapters: Set<number>,
): Ownership {
  if (parsed.targetLow === null) return 'none';

  if (parsed.targetKind === 'volume') {
    return ownedVolumes.has(parsed.targetLow) ? 'in-library' : 'none';
  }

  if (parsed.targetKind === 'chapter') {
    return ownedChapters.has(parsed.targetLow) ? 'in-library' : 'none';
  }

  // batch
  if (parsed.targetHigh === null) return 'none';

  if (granularity === 'volume') {
    for (let n = Math.floor(parsed.targetLow); n <= Math.floor(parsed.targetHigh); n++) {
      if (!ownedVolumes.has(n)) return 'none';
    }
    return 'in-library';
  } else {
    for (let n = parsed.targetLow; n <= parsed.targetHigh; n++) {
      if (!ownedChapters.has(n)) return 'none';
    }
    return 'in-library';
  }
}

export async function POST(req: Request): Promise<Response> {
  const log = logger().child({ component: 'api.search.interactive' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const parsedBody = InteractiveSearchBody.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.message }, { status: 400 });
  }

  const series = await getSeries(parsedBody.data.seriesId);
  if (!series) {
    return NextResponse.json({ error: 'series not found' }, { status: 404 });
  }

  const profile = await getQualityProfile(series.qualityProfileId);
  if (!profile) {
    return NextResponse.json({ error: 'profile not found' }, { status: 500 });
  }

  // Build ownership index for this series
  const ownedVolumes = new Set<number>();
  const ownedChapters = new Set<number>();
  if (series.granularity === 'volume') {
    const rows = await getDb()
      .select({ number: volumes.number })
      .from(libraryFiles)
      .innerJoin(volumes, eq(libraryFiles.volumeId, volumes.id))
      .where(eq(libraryFiles.seriesId, series.id));
    rows.forEach((r) => ownedVolumes.add(r.number));
  } else {
    const rows = await getDb()
      .select({ numberSort: chapters.numberSort })
      .from(libraryFiles)
      .innerJoin(chapters, eq(libraryFiles.chapterId, chapters.id))
      .where(eq(libraryFiles.seriesId, series.id));
    rows.forEach((r) => ownedChapters.add(r.numberSort));
  }

  const [weights, adultFilter] = await Promise.all([
    scoringWeightsSetting.get(),
    adultFilterSetting.get(),
  ]);

  const indexers = await listEnabledIndexers();
  const errors: { indexerId: number; message: string }[] = [];
  const results: InteractiveSearchResult[] = [];
  const upsertedReleaseIds = new Map<string, number>(); // guid → releaseId

  for (const idx of indexers) {
    const kind = idx.kind as IndexerKind;
    const cfg = parseCfg(idx.configJson, kind);

    // The series' content type must be configured on this indexer, with a
    // category to query against. Skip indexers that don't cover it — they can't
    // be searched (and would otherwise be miscounted as failures).
    if (!cfg.contentTypes.includes(series.contentType)) continue;
    const category = cfg.categoryByContentType[series.contentType];
    if (category == null) continue;

    // Sonarr-style: search every known title (English / romaji / native) and
    // merge the results, deduped by guid. A custom override searches just itself.
    const queries = parsedBody.data.queryOverride
      ? [parsedBody.data.queryOverride]
      : buildQueries(series, cfg);
    if (queries.length === 0) continue;

    const itemsByGuid = new Map<string, IndexerResult>();
    for (const q of queries) {
      try {
        const found = await searchIndexer(idx, cfg, { q, category });
        for (const it of found) if (!itemsByGuid.has(it.guid)) itemsByGuid.set(it.guid, it);
      } catch (err) {
        const message = (err as Error).message;
        log.warn({ indexerId: idx.id, q, err: message }, 'indexer error');
        errors.push({ indexerId: idx.id, message });
      }
    }

    for (const item of itemsByGuid.values()) {
      const parsed = refineForSeries(parseReleaseTitle(item.title), { granularity: series.granularity, totalVolumes: series.totalVolumes });
      const existing = await findReleaseByIndexerGuid(idx.id, item.guid);
      const matchResult = matchRelease(
        { parsed, series, profile, raw: item, rejectedAt: existing?.rejectedAt ?? null },
        { weights, adultFilter },
      );
      const ownership = computeOwnership(parsed, series.granularity, ownedVolumes, ownedChapters);

      let releaseId: number | null = null;
      if (matchResult.matches) {
        releaseId = await upsertReleaseByGuid({
          indexerId: idx.id,
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
          score: matchResult.score,
        });
        upsertedReleaseIds.set(item.guid, releaseId);
      }

      results.push({
        item: {
          guid: item.guid,
          title: item.title,
          link: item.link,
          seeders: item.seeders,
          leechers: item.leechers,
          sizeBytes: item.sizeBytes,
          publishedAt: item.pubDate.toISOString(),
          indexerId: idx.id,
          indexerName: idx.name,
          indexerKind: idx.kind,
          infoUrl: buildIndexerInfoUrl(idx.kind, idx.baseUrl, item.guid),
          freeleech: item.freeleech ?? false,
          vip: item.vip ?? false,
        },
        parsed,
        matchResult,
        ownership,
        releaseId,
      });
    }
  }

  // Build downloading set from active download rows (M7)
  if (upsertedReleaseIds.size > 0) {
    const ACTIVE_DL = new Set(['queued', 'downloading', 'importing']);
    const downloadRows = await listDownloadsForReleaseIds(Array.from(upsertedReleaseIds.values()));
    const downloadingReleaseIds = new Set(
      downloadRows.filter((d) => ACTIVE_DL.has(d.status)).map((d) => d.releaseId),
    );
    for (const result of results) {
      if (
        result.releaseId !== null &&
        result.ownership === 'none' &&
        downloadingReleaseIds.has(result.releaseId)
      ) {
        result.ownership = 'downloading';
      }
    }
  }

  // 502 only when every indexer failed AND no items collected (and there were enabled indexers)
  if (errors.length === indexers.length && results.length === 0 && indexers.length > 0) {
    return NextResponse.json({ error: 'all indexers failed', errors }, { status: 502 });
  }

  // Sort: matches first, then by score desc within matches, then by seeders desc within non-matches
  results.sort((a, b) => {
    const am = a.matchResult.matches ? 1 : 0;
    const bm = b.matchResult.matches ? 1 : 0;
    if (am !== bm) return bm - am;
    if (a.matchResult.matches && b.matchResult.matches) {
      return b.matchResult.score - a.matchResult.score;
    }
    return b.item.seeders - a.item.seeders;
  });

  return NextResponse.json({ results, errors });
}

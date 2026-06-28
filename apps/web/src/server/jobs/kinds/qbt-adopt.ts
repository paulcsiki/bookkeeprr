import { z } from 'zod';
import { listTorrentsInCategory } from '@/server/integrations/qbittorrent';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { listDownloads, insertDownload } from '@/server/db/downloads';
import { listAllSeries } from '@/server/db/series';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { getOrCreateManualIndexer } from '@/server/db/indexers';
import { enqueueJob } from '@/server/db/jobs';
import { parseReleaseTitle, refineForSeries } from '@/server/parser/release';
import { titleMatches } from '@/server/matcher';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import { getQbtCategory } from '@/server/content-type/paths';
import { runUntilIdle } from '@/server/jobs/runner';
import { importDescriptor } from './import';
import { mapQbtState } from './qbt-watch';
import { logger } from '@/server/logger';
import type { SeriesRow } from '@/server/db/schema';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

/** Fire just-enqueued imports immediately; skipped under Vitest for determinism. */
function kickImport(): void {
  if (process.env.VITEST) return;
  void runUntilIdle(importDescriptor).catch(() => {});
}

const Payload = z.object({}).passthrough();

type Result = { scanned: number; adopted: number; unmatched: number; skipped?: string };

/**
 * Adopt torrents the user added to qBittorrent by hand (Radarr/Sonarr style):
 * scan each bookkeeprr content-type category for torrents we don't already track,
 * match the torrent name to a single series of that content type by title, and
 * create a release (under the Manual sentinel indexer) + download row. qbt-watch
 * and the importer then take it the rest of the way. Ambiguous (0 or >1 series
 * match) torrents are left alone.
 */
export const qbtAdoptDescriptor: JobKindDescriptor<Record<string, unknown>, Result> = {
  kind: 'qbt_adopt',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (rawPayload) => {
    const log = logger().child({ component: 'qbt_adopt' });
    Payload.parse(rawPayload);

    const cfg = await qbtConnectionSetting.get();
    if (!isQbtConfigured(cfg)) {
      return { scanned: 0, adopted: 0, unmatched: 0, skipped: 'not-configured' };
    }

    const known = new Set((await listDownloads()).map((d) => d.qbtHash.toLowerCase()));
    const byType = new Map<ContentType, SeriesRow[]>();
    for (const s of await listAllSeries()) {
      const arr = byType.get(s.contentType) ?? [];
      arr.push(s);
      byType.set(s.contentType, arr);
    }

    let scanned = 0;
    let adopted = 0;
    let unmatched = 0;
    let importsEnqueued = 0;
    let manualId: number | null = null;

    for (const ct of CONTENT_TYPES) {
      const seriesForType = byType.get(ct) ?? [];
      if (seriesForType.length === 0) continue; // nothing to match against
      const category = await getQbtCategory(ct);
      let torrents: Awaited<ReturnType<typeof listTorrentsInCategory>>;
      try {
        torrents = await listTorrentsInCategory(cfg, category);
      } catch (err) {
        log.warn({ err: (err as Error).message, category }, 'qbt list failed; skipping category');
        continue;
      }

      for (const t of torrents) {
        if (known.has(t.hash.toLowerCase())) continue; // already tracked
        scanned++;
        const parsedBase = parseReleaseTitle(t.name);
        const candidates = seriesForType.filter((s) => titleMatches(parsedBase, s));
        if (candidates.length !== 1) {
          unmatched++;
          continue; // no match, or ambiguous — don't guess
        }
        const series = candidates[0]!;
        const parsed = refineForSeries(parsedBase, {
          granularity: series.granularity,
          totalVolumes: series.totalVolumes,
        });
        manualId ??= await getOrCreateManualIndexer();
        const releaseId = await upsertReleaseByGuid({
          indexerId: manualId,
          indexerGuid: t.hash,
          seriesId: series.id,
          title: t.name,
          link: '', // already in qBit — nothing to re-fetch
          targetKind: parsed.targetKind,
          targetLow: parsed.targetLow,
          targetHigh: parsed.targetHigh,
          groupName: parsed.group,
          language: parsed.language,
          sizeBytes: t.size,
          seeders: 0,
          leechers: 0,
          publishedAt: new Date(),
        });
        const status = mapQbtState(t.state, t.progress);
        const downloadId = await insertDownload({ releaseId, qbtHash: t.hash, status });
        known.add(t.hash.toLowerCase());
        adopted++;
        log.info(
          { downloadId, seriesId: series.id, hash: t.hash, status, name: t.name },
          'adopted manually-added torrent',
        );
        if (status === 'completed') {
          await enqueueJob('import', { downloadId });
          importsEnqueued++;
        }
      }
    }

    if (importsEnqueued > 0) kickImport();
    return { scanned, adopted, unmatched };
  },
};

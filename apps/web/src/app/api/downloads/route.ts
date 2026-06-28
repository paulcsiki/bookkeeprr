import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { downloads, indexers, releases, series } from '@/server/db/schema';
import { proxiedCoverUrl } from '@/server/images/allowlist';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { listTorrentsByHashes } from '@/server/integrations/qbittorrent/client';
import type { QbtTorrent } from '@/server/integrations/qbittorrent/schemas';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = new Set(['queued', 'downloading', 'importing']);

// qBittorrent reports eta = 8640000 (100 days = 2400h) as an "infinite/unknown"
// sentinel — e.g. for a finished or stalled torrent. Surface that, and any
// fully-downloaded torrent, as "no ETA" rather than a bogus 2400h.
const QBT_ETA_INFINITY = 8_640_000;
function normalizeEta(lt: QbtTorrent | undefined): number | null {
  if (!lt || lt.eta == null) return null;
  if (lt.eta >= QBT_ETA_INFINITY) return null;
  if ((lt.progress ?? 0) >= 1) return null;
  return lt.eta;
}

// Best-effort: merge live qBittorrent transfer stats (progress, speed, ETA,
// seeds) for the active downloads. Never fail the request if qBittorrent is
// unconfigured or unreachable — the DB rows are the source of truth.
async function fetchLiveTorrents(hashes: string[]): Promise<Map<string, QbtTorrent>> {
  if (hashes.length === 0) return new Map();
  try {
    const conn = await qbtConnectionSetting.get();
    if (!isQbtConfigured(conn)) return new Map();
    const torrents = await listTorrentsByHashes(conn, hashes);
    return new Map(torrents.map((tt) => [tt.hash.toLowerCase(), tt]));
  } catch {
    return new Map();
  }
}

export async function GET(): Promise<Response> {
  const rows = await getDb()
    .select({
      d_id: downloads.id,
      d_qbtHash: downloads.qbtHash,
      d_status: downloads.status,
      d_addedAt: downloads.addedAt,
      d_completedAt: downloads.completedAt,
      d_importedAt: downloads.importedAt,
      d_error: downloads.error,
      r_id: releases.id,
      r_title: releases.title,
      r_indexerGuid: releases.indexerGuid,
      r_seriesId: releases.seriesId,
      i_name: indexers.name,
      i_kind: indexers.kind,
      s_id: series.id,
      s_titleEnglish: series.titleEnglish,
      s_titleRomaji: series.titleRomaji,
      s_coverUrl: series.coverUrl,
      s_contentType: series.contentType,
    })
    .from(downloads)
    .leftJoin(releases, eq(downloads.releaseId, releases.id))
    .leftJoin(series, eq(releases.seriesId, series.id))
    .leftJoin(indexers, eq(releases.indexerId, indexers.id))
    .orderBy(desc(downloads.addedAt))
    .limit(200);

  const activeHashes = rows
    .filter((r) => ACTIVE_STATUSES.has(r.d_status))
    .map((r) => r.d_qbtHash)
    .filter((h): h is string => typeof h === 'string' && h.length > 0);
  const live = await fetchLiveTorrents(activeHashes);

  return NextResponse.json({
    downloads: rows.map((r) => {
      const lt = r.d_qbtHash ? live.get(r.d_qbtHash.toLowerCase()) : undefined;
      return {
        id: r.d_id,
        qbtHash: r.d_qbtHash,
        status: r.d_status,
        addedAt: r.d_addedAt.toISOString(),
        completedAt: r.d_completedAt?.toISOString() ?? null,
        importedAt: r.d_importedAt?.toISOString() ?? null,
        error: r.d_error,
        // Live qBittorrent transfer stats (null when not active / qbt off).
        progress: lt?.progress ?? null,
        downloadSpeed: lt?.dlspeed ?? null,
        eta: normalizeEta(lt),
        seeds: lt?.num_seeds ?? null,
        sizeBytes: lt?.size ?? null,
        release:
          r.r_id !== null && r.r_title !== null && r.r_indexerGuid !== null
            ? {
                id: r.r_id,
                title: r.r_title,
                indexerGuid: r.r_indexerGuid,
                // Manual grabs / qbt-adopted torrents live under the singleton
                // "Manual" sentinel indexer (kind 'manual') — the UI badges them.
                indexerName: r.i_name,
                indexerKind: r.i_kind,
              }
            : null,
        series:
          r.s_id !== null
            ? {
                id: r.s_id,
                title: r.s_titleEnglish ?? r.s_titleRomaji ?? `Series #${r.s_id}`,
                // Route external CDN covers through the caching /api/img proxy so
                // the mobile client (which can't add the MangaDex Referer) can
                // load them. Root-relative; the client resolves it against its
                // server URL via resolveAssetUri.
                coverUrl: proxiedCoverUrl(r.s_coverUrl),
                contentType: r.s_contentType,
              }
            : null,
      };
    }),
  });
}

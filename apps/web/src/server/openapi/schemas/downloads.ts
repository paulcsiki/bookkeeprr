import { z } from 'zod';
export { MessageResponse } from './common';
import { ContentTypeEnum } from './series';

// ─────────────────────────────────────────────────────────────────────────────
// Downloads family — no request bodies/queries; everything here is a response
// schema authored from the handlers' actual NextResponse.json payloads.
// ─────────────────────────────────────────────────────────────────────────────

/** `downloads.status` column enum (src/server/db/schema.ts). */
export const DownloadStatusEnum = z.enum([
  'queued',
  'downloading',
  'completed',
  'importing',
  'imported',
  'failed',
  'superseded',
]);

/** One row of GET /api/downloads — the downloads row plus live qBittorrent
 *  transfer stats (null when the torrent is not active or qBittorrent is
 *  unconfigured/unreachable) and the joined release + series. */
export const DownloadRow = z.object({
  id: z.number().int(),
  qbtHash: z.string(),
  status: DownloadStatusEnum,
  addedAt: z.string(),
  completedAt: z.string().nullable(),
  importedAt: z.string().nullable(),
  error: z.string().nullable(),
  // Live qBittorrent transfer stats (best-effort merge).
  progress: z.number().nullable(),
  downloadSpeed: z.number().nullable(),
  eta: z.number().nullable(),
  seeds: z.number().int().nullable(),
  sizeBytes: z.number().int().nullable(),
  // Null when the release row was deleted out from under the download.
  release: z
    .object({
      id: z.number().int(),
      title: z.string(),
      indexerGuid: z.string(),
      // Manual grabs / qbt-adopted torrents live under the singleton "Manual"
      // sentinel indexer (kind 'manual').
      indexerName: z.string().nullable(),
      indexerKind: z.string().nullable(),
    })
    .nullable(),
  // Null when the release is orphaned (its series was deleted).
  series: z
    .object({
      id: z.number().int(),
      title: z.string(),
      // External CDN covers are rewritten through the caching /api/img proxy.
      coverUrl: z.string().nullable(),
      // Content type is included so clients can pick a matching placeholder colour
      // when the cover is absent.
      contentType: ContentTypeEnum,
    })
    .nullable(),
});

/** GET /api/downloads 200 — capped at the 200 most-recent rows. */
export const DownloadsListResponse = z.object({
  downloads: z.array(DownloadRow),
});

/** Bare success acknowledgement for the qBittorrent control endpoints. */
export const OkResponse = z.object({ ok: z.literal(true) });

/** DELETE /api/downloads/history 200 — `deleted` = number of rows cleared. */
export const HistoryClearResponse = z.object({
  ok: z.literal(true),
  deleted: z.number().int(),
});


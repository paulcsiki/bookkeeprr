import { getSeries } from '@/server/db/series';
import { getOrCreateManualIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { getDownloadByQbtHash, deleteDownload } from '@/server/db/downloads';
import { parseMagnetInfohash, parseTorrentBytes, type ParsedTorrentInfo } from '@/lib/infohash';
import { logger } from '@/server/logger';
import {
  grabRelease,
  ACTIVE_DOWNLOAD_STATUSES,
  type GrabError,
  type PresetTorrent,
} from './index';

/**
 * Manual grab: the user supplies their own magnet link or `.torrent` file for a
 * series when no indexer release fits. The torrent flows through the NORMAL
 * pipeline — a release row (under the singleton "Manual" sentinel indexer, the
 * same one qbt-adopt uses), `grabRelease`'s qBittorrent add + bookkeeping, then
 * qbt-watch → import → health-check exactly like an indexer grab.
 *
 * The release row is conservative on purpose: `targetKind: 'batch'` with null
 * bounds, so auto-grab never picks it as a candidate and the post-import
 * redundancy sweep spares it (null bounds = indeterminate = never cancel). The
 * importer routes content by filename, so no target metadata is needed.
 */
export type ManualGrabInput =
  | { magnet: string }
  | { torrentBytes: Uint8Array; fileName?: string };

export type ManualGrabError =
  | { code: 'series-not-found'; message: string }
  | { code: 'invalid-input'; message: string }
  | { code: 'duplicate'; message: string; downloadId: number }
  | GrabError;

export type ManualGrabResult =
  | { ok: true; result: { releaseId: number; downloadId: number; qbtHash: string } }
  | { ok: false; error: ManualGrabError };

/** The synthetic, idempotent indexer GUID for a manually-supplied torrent. */
export function manualReleaseGuid(infohash: string): string {
  return `manual:${infohash.toLowerCase()}`;
}

/** `dn=` display-name param of a magnet URI, when present and non-empty. */
function magnetDisplayName(magnet: string): string | null {
  const params = new URLSearchParams(magnet.slice('magnet:?'.length));
  const dn = params.get('dn')?.trim();
  return dn ? dn : null;
}

function fallbackTitle(infohash: string): string {
  return `Manual upload ${infohash.slice(0, 8)}`;
}

type ParsedInput = {
  infohash: string;
  title: string;
  link: string;
  sizeBytes: number;
  /** Set for `.torrent` uploads — handed to qBittorrent as the payload. */
  preset?: PresetTorrent;
};

function parseInput(input: ManualGrabInput): ParsedInput | { error: string } {
  if ('magnet' in input) {
    const magnet = input.magnet.trim();
    const infohash = magnet.startsWith('magnet:?') ? parseMagnetInfohash(magnet) : null;
    if (!infohash) return { error: 'not a valid magnet link (missing urn:btih info-hash)' };
    return {
      infohash,
      title: magnetDisplayName(magnet) ?? fallbackTitle(infohash),
      link: magnet,
      sizeBytes: 0,
    };
  }
  let torrent: ParsedTorrentInfo;
  try {
    torrent = parseTorrentBytes(input.torrentBytes);
  } catch (err) {
    return { error: `not a valid .torrent file: ${(err as Error).message}` };
  }
  const fromFileName = input.fileName?.replace(/\.torrent$/i, '').trim();
  return {
    infohash: torrent.infohash,
    title: torrent.name ?? (fromFileName || fallbackTitle(torrent.infohash)),
    // Nothing to (re-)fetch — the uploaded bytes are the payload. Same shape
    // qbt-adopt uses for torrents that are already in qBittorrent.
    link: '',
    sizeBytes: torrent.sizeBytes,
    preset: { torrentFile: input.torrentBytes, infohash: torrent.infohash },
  };
}

export async function manualGrab(
  seriesId: number,
  input: ManualGrabInput,
): Promise<ManualGrabResult> {
  const log = logger().child({ component: 'manual-grab', seriesId });

  const seriesRow = await getSeries(seriesId);
  if (!seriesRow) {
    return { ok: false, error: { code: 'series-not-found', message: 'series not found' } };
  }

  const parsed = parseInput(input);
  if ('error' in parsed) {
    return { ok: false, error: { code: 'invalid-input', message: parsed.error } };
  }

  // Idempotency: `downloads.qbt_hash` is globally unique, so an info-hash with a
  // live (or imported) download — from a previous manual grab, an indexer grab,
  // or qbt-adopt — is a hard duplicate. A terminal leftover (failed/superseded)
  // is cleared so the retry can insert a fresh row for the same hash.
  const dup = await getDownloadByQbtHash(parsed.infohash);
  if (dup) {
    if (ACTIVE_DOWNLOAD_STATUSES.has(dup.status)) {
      return {
        ok: false,
        error: {
          code: 'duplicate',
          message: 'this torrent was already grabbed (active or imported download exists)',
          downloadId: dup.id,
        },
      };
    }
    await deleteDownload(dup.id);
  }

  const manualIndexerId = await getOrCreateManualIndexer();
  const releaseId = await upsertReleaseByGuid({
    seriesId,
    indexerId: manualIndexerId,
    indexerGuid: manualReleaseGuid(parsed.infohash),
    title: parsed.title,
    link: parsed.link,
    targetKind: 'batch',
    targetLow: null,
    targetHigh: null,
    sizeBytes: parsed.sizeBytes,
    publishedAt: new Date(),
  });

  // Reuse grabRelease's full bookkeeping path (qbt add, hash visibility poll,
  // download row, grab-success notification, activity event). `.torrent`
  // uploads hand it the bytes + known info-hash directly.
  const result = await grabRelease(releaseId, parsed.preset);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  log.info(
    { releaseId, downloadId: result.result.downloadId, infohash: parsed.infohash },
    'manual grab succeeded',
  );
  return {
    ok: true,
    result: {
      releaseId,
      downloadId: result.result.downloadId,
      qbtHash: result.result.qbtHash,
    },
  };
}

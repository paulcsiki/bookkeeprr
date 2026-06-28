import { getRelease, markReleaseRejected } from '@/server/db/releases';
import {
  insertDownload,
  listDownloadsByRelease,
  getDownloadByQbtHash,
} from '@/server/db/downloads';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import {
  addTorrent,
  listTorrentsInCategory,
  deleteTorrent,
  QbittorrentError,
} from '@/server/integrations/qbittorrent';
import { parseMagnetInfohash, resolveDownloadLink, parseTorrentBytes } from '@/lib/infohash';
import { logger } from '@/server/logger';
import { getSeries } from '@/server/db/series';
import { getQbtCategory } from '@/server/content-type/paths';
import { notify } from '@/server/notifications';
import { getIndexer, parseIndexerConfig } from '@/server/db/indexers';
import type { IndexerKind, MamConfig } from '@/server/integrations/indexers/types';
import { downloadMamTorrent } from '@/server/integrations/mam';
import { recordActivity } from '@/server/db/activity-events';

const SAVE_PATH = '/media/downloads/incomplete';

const HASH_POLL_ATTEMPTS = 10;
const HASH_POLL_INTERVAL_MS = 500;
/** Download statuses that mean "this torrent is in flight or kept" — anything
 * here blocks a re-grab. Shared with the manual-grab path's duplicate check. */
export const ACTIVE_DOWNLOAD_STATUSES: ReadonlySet<string> = new Set([
  'queued',
  'downloading',
  'completed',
  'importing',
  'imported',
]);

export type GrabError =
  | { code: 'not-found'; message: string }
  | { code: 'orphaned'; message: string }
  | { code: 'already-grabbed'; message: string; downloadId: number }
  | { code: 'duplicate-grab'; message: string }
  | { code: 'not-configured'; message: string }
  | { code: 'malformed-link'; message: string }
  | { code: 'qbt-add-failed'; message: string }
  | { code: 'download-link-failed'; message: string }
  | { code: 'qbt-not-visible'; message: string };

export type GrabResult =
  | { ok: true; result: { downloadId: number; qbtHash: string } }
  | { ok: false; error: GrabError };

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Decide what to hand qBittorrent for `link`, plus the expected info-hash.
 * qBit cannot reliably add an http endpoint that 302-redirects to a magnet (it
 * fetches the URL expecting a .torrent and silently drops the magnet redirect),
 * so we resolve such links to the magnet ourselves and add THAT. Real .torrent
 * endpoints (private trackers) are handed to qBit unchanged. Returns a null
 * info-hash when we couldn't resolve it (rate-limit / flaky endpoint) — the
 * caller then discovers the hash by diffing the qBit category after the add.
 */
type QbtAddTarget = {
  url?: string;
  torrentFile?: Uint8Array;
  infohash: string | null;
  /** Why we couldn't resolve the link ourselves (so the URL-fallback path can
   * report the real reason if qBit also fails to fetch it). */
  resolveError?: string;
};

async function resolveForQbt(link: string): Promise<QbtAddTarget> {
  if (link.startsWith('magnet:')) return { url: link, infohash: parseMagnetInfohash(link) };
  try {
    const resolved = await resolveDownloadLink(link);
    if (resolved.kind === 'magnet') return { url: resolved.magnet, infohash: resolved.infohash };
    // Real .torrent: hand qBit the bytes we already downloaded rather than the
    // URL — private trackers (FileList) are often unreachable from the qBit pod
    // or serve single-use links, so a re-fetch by qBit silently fails.
    return { torrentFile: resolved.torrent, infohash: resolved.infohash };
  } catch (err) {
    // Indexer rate-limited us / blocked UA / disabled the indexer / flaky
    // endpoint. Hand qBit the raw link and recover the hash via the category
    // diff — qBit may have access we don't — but remember WHY we couldn't
    // resolve it, so a subsequent "not visible" can surface the real cause
    // (e.g. an HTTP 500 / "indexer is disabled" from Prowlarr) instead of an
    // opaque qbt-not-visible.
    return { url: link, infohash: null, resolveError: (err as Error).message };
  }
}

/**
 * Pre-resolved add target for torrents whose bytes the caller already holds
 * (a user-uploaded `.torrent` from manual grab). Skips the release-link
 * resolution entirely — the bytes + info-hash are authoritative.
 */
export type PresetTorrent = { torrentFile: Uint8Array; infohash: string };

/**
 * Guard against re-grabbing a torrent whose info-hash is already tracked by a
 * download row. The `downloads.qbt_hash` UNIQUE index makes a second insert for
 * the same hash throw — and the same physical torrent routinely appears as
 * multiple release rows (one per indexer), so a release rejected on indexer A
 * has un-rejected twins on indexers B/C pointing at the SAME torrent.
 *
 * Returns a terminating GrabResult when the hash is a duplicate, or null when
 * it's genuinely new (caller proceeds to insert). When the existing row is a
 * different release that was permanently rejected, this release inherits that
 * rejection so the matcher/auto-grab excludes it pre-grab next cycle (no more
 * link re-fetches → no more indexer "grab" notifications).
 */
async function checkHashDuplicate(
  infohash: string,
  releaseId: number,
): Promise<GrabResult | null> {
  const dupe = await getDownloadByQbtHash(infohash);
  if (!dupe) return null;
  if (ACTIVE_DOWNLOAD_STATUSES.has(dupe.status)) {
    return {
      ok: false,
      error: {
        code: 'already-grabbed',
        message: 'torrent already grabbed under another release',
        downloadId: dupe.id,
      },
    };
  }
  // Terminal duplicate (failed/superseded): re-grabbing the identical torrent is
  // pointless. Propagate a permanent rejection when the original was rejected.
  if (dupe.releaseId !== releaseId) {
    const dupeRelease = await getRelease(dupe.releaseId);
    if (dupeRelease?.rejectedAt) {
      await markReleaseRejected(
        releaseId,
        `duplicate of rejected release #${dupe.releaseId} (${dupeRelease.rejectionReason ?? 'rejected'})`,
      );
    }
  }
  return {
    ok: false,
    error: {
      code: 'duplicate-grab',
      message: `torrent already tracked by download #${dupe.id} (${dupe.status})`,
    },
  };
}

export async function grabRelease(
  releaseId: number,
  presetTorrent?: PresetTorrent,
): Promise<GrabResult> {
  const log = logger().child({ component: 'grabber', releaseId });
  const release = await getRelease(releaseId);
  if (!release) {
    return { ok: false, error: { code: 'not-found', message: 'release not found' } };
  }
  if (release.seriesId === null) {
    return { ok: false, error: { code: 'orphaned', message: 'release orphaned' } };
  }
  const seriesRow = await getSeries(release.seriesId);
  if (!seriesRow) {
    return { ok: false, error: { code: 'orphaned', message: 'series not found' } };
  }
  const indexerRow = await getIndexer(release.indexerId);
  const category = await getQbtCategory(seriesRow.contentType);
  const existing = await listDownloadsByRelease(releaseId);
  const active = existing.find((d) => ACTIVE_DOWNLOAD_STATUSES.has(d.status));
  if (active) {
    return {
      ok: false,
      error: { code: 'already-grabbed', message: 'already grabbed', downloadId: active.id },
    };
  }
  const cfg = await qbtConnectionSetting.get();
  if (!isQbtConfigured(cfg)) {
    return { ok: false, error: { code: 'not-configured', message: 'qbittorrent not configured' } };
  }
  // The link must be addable by qBittorrent: a magnet or an http(s) torrent /
  // redirect URL. Anything else is genuinely malformed. A preset torrent skips
  // this — its bytes are the payload, the release link is informational only.
  const link = release.link;
  if (
    !presetTorrent &&
    !link.startsWith('magnet:') &&
    !link.startsWith('http://') &&
    !link.startsWith('https://')
  ) {
    return { ok: false, error: { code: 'malformed-link', message: 'malformed release link' } };
  }

  // MAM is a private tracker whose download endpoint is IP-locked behind gluetun
  // and needs the mam_id session cookie — neither our default fetch nor qBit can
  // reach it. Fetch the .torrent bytes ourselves through the proxied MAM client
  // and feed them in as a preset, exactly like a manual .torrent upload.
  let effectivePreset = presetTorrent;
  if (!effectivePreset && indexerRow && (indexerRow.kind as IndexerKind) === 'mam') {
    const mamCfg = parseIndexerConfig(indexerRow.configJson, 'mam') as MamConfig;
    try {
      const bytes = await downloadMamTorrent(
        { mamId: mamCfg.mamId, proxyUrl: mamCfg.proxyUrl },
        release.indexerGuid,
        indexerRow.baseUrl,
      );
      effectivePreset = { torrentFile: bytes, infohash: parseTorrentBytes(bytes).infohash };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'download-link-failed',
          message: `MAM download failed: ${(err as Error).message}`,
        },
      };
    }
  }
  // Resolve what to actually hand qBittorrent (magnet, raw .torrent bytes, or the
  // URL) and the expected info-hash. A null hash means we couldn't resolve it
  // (rate-limit / flaky endpoint) — we then discover the hash by diffing.
  const { url: addUrl, torrentFile, infohash: precomputed, resolveError } = effectivePreset
    ? {
        url: undefined,
        torrentFile: effectivePreset.torrentFile,
        infohash: effectivePreset.infohash,
        resolveError: undefined,
      }
    : await resolveForQbt(link);
  // When we know the hash up-front (magnet / resolved redirect / preset .torrent),
  // bail on a duplicate BEFORE re-adding the torrent to qBittorrent.
  if (precomputed) {
    const dup = await checkHashDuplicate(precomputed, releaseId);
    if (dup) return dup;
  }
  let before = new Set<string>();
  if (!precomputed) {
    try {
      const existing = await listTorrentsInCategory(cfg, category);
      before = new Set(existing.map((t) => t.hash.toLowerCase()));
    } catch {
      // best-effort; an empty snapshot just means the diff picks the newest add
    }
  }

  try {
    await addTorrent(cfg, {
      url: addUrl,
      torrentFile,
      category,
      // No qBit tags — matching/import keys off the category + info-hash, not tags.
      tags: [],
      savePath: SAVE_PATH,
    });
  } catch (err) {
    const message = err instanceof QbittorrentError ? err.message : (err as Error).message;
    log.warn({ err: message }, 'qbt add failed');
    return { ok: false, error: { code: 'qbt-add-failed', message: `qbt add failed: ${message}` } };
  }

  // Resolve the info-hash: confirm the precomputed one became visible, or pick
  // the newly-added torrent (one that wasn't in the category before the add,
  // newest first when qBit reports added_on).
  let infohash: string | null = null;
  for (let i = 0; i < HASH_POLL_ATTEMPTS; i++) {
    try {
      const list = await listTorrentsInCategory(cfg, category);
      if (precomputed) {
        if (list.some((t) => t.hash.toLowerCase() === precomputed.toLowerCase())) {
          infohash = precomputed.toLowerCase();
          break;
        }
      } else {
        const fresh = list.filter((t) => !before.has(t.hash.toLowerCase()));
        if (fresh.length > 0) {
          fresh.sort((a, b) => (b.added_on ?? 0) - (a.added_on ?? 0));
          infohash = fresh[0]!.hash.toLowerCase();
          break;
        }
      }
    } catch {
      // transient
    }
    await sleep(HASH_POLL_INTERVAL_MS);
  }
  if (!infohash) {
    // If we fell back to handing qBit the raw URL because we couldn't resolve
    // the link, the real cause is almost always that the download endpoint
    // failed (e.g. Prowlarr returned HTTP 500 / "indexer is disabled"). Surface
    // that rather than the opaque visibility error so the failure is actionable.
    if (resolveError) {
      return {
        ok: false,
        error: { code: 'download-link-failed', message: `download link failed: ${resolveError}` },
      };
    }
    return {
      ok: false,
      error: { code: 'qbt-not-visible', message: 'qbt accepted add but torrent not visible' },
    };
  }
  // Hash discovered only after the add (category-diff path): re-check for a
  // duplicate now, and remove the torrent we just added so qBittorrent isn't
  // left holding a redundant copy of an already-tracked torrent.
  if (!precomputed) {
    const dup = await checkHashDuplicate(infohash, releaseId);
    if (dup) {
      try {
        await deleteTorrent(cfg, infohash);
      } catch (err) {
        log.warn({ err: (err as Error).message, infohash }, 'failed to remove duplicate torrent');
      }
      return dup;
    }
  }
  const downloadId = await insertDownload({ releaseId, qbtHash: infohash, status: 'queued' });
  try {
    await notify({
      kind: 'grab-success',
      series: seriesRow,
      release,
      indexerName: indexerRow?.name ?? 'unknown',
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'grab-success notification failed');
  }
  // Activity feed: emit a "grabbed" event on success. The grabber runs in a job
  // with no session, so the event has no user. Best-effort — never throws here.
  await recordActivity({
    userId: null,
    kind: 'grabbed',
    seriesId: seriesRow.id,
    meta: { releaseId: release.id, title: release.title },
  });
  return { ok: true, result: { downloadId, qbtHash: infohash } };
}

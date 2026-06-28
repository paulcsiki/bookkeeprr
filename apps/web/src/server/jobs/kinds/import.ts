import { z } from 'zod';
import { importDownload, type ImportResult } from '@/server/importer';
import { getDownload, updateDownload } from '@/server/db/downloads';
import { getRelease } from '@/server/db/releases';
import { cancelRedundantSiblingDownloads } from '@/server/importer/cancel-redundant';
import { logger } from '@/server/logger';
import { safeNotifyImportSummary, safeNotifyFailure } from '@/server/notifications';
import { safeTriggerRefresh } from '@/server/library-sync';
import { deleteTorrent } from '@/server/integrations/qbittorrent';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { torrentCleanupSetting } from '@/server/db/settings/library';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_TIMEOUT_MS } from '../types';

/**
 * after_import torrent cleanup: when the policy is `after_import` and qBit is
 * configured, remove the torrent (optionally its files) once the download is
 * imported. A delete failure must never fail or revert the import — the file is
 * already a separate hardlink/copy in the library — so we only log a warning.
 */
async function maybeCleanupAfterImport(downloadId: number): Promise<void> {
  const log = logger().child({ component: 'import' });
  try {
    const policy = await torrentCleanupSetting.get();
    if (policy.mode !== 'after_import') return;
    const cfg = await qbtConnectionSetting.get();
    if (!isQbtConfigured(cfg)) return;
    const download = await getDownload(downloadId);
    if (!download) return;
    await deleteTorrent(cfg, download.qbtHash, { deleteFiles: policy.deleteFiles });
    log.info(
      { downloadId, hash: download.qbtHash, deleteFiles: policy.deleteFiles },
      'removed torrent after import',
    );
  } catch (err) {
    log.warn(
      { err: (err as Error).message, downloadId },
      'after_import torrent cleanup failed; continuing',
    );
  }
}

/**
 * After a successful import, cancel + delete (qBit) still-active sibling
 * downloads for the same series whose release now covers only already-owned
 * targets. Best-effort: a failure here must never fail or revert the import (the
 * files already landed in the library), so we only log a warning. The series is
 * resolved download→release→series — `ImportResult` doesn't carry it.
 */
async function maybeCancelRedundant(downloadId: number): Promise<void> {
  const log = logger().child({ component: 'import' });
  try {
    const download = await getDownload(downloadId);
    if (!download) return;
    const release = await getRelease(download.releaseId);
    if (!release || release.seriesId === null) return;
    await cancelRedundantSiblingDownloads(downloadId, release.seriesId);
  } catch (err) {
    log.warn(
      { err: (err as Error).message, downloadId },
      'cancel-redundant sweep failed; continuing',
    );
  }
}

const Payload = z.object({ downloadId: z.number().int().positive() });

export const importDescriptor: JobKindDescriptor<{ downloadId: number }, ImportResult> = {
  kind: 'import',
  retryPolicy: { maxAttempts: 3 },
  timeoutMs: DEFAULT_TIMEOUT_MS * 5,
  handler: async (rawPayload) => {
    const log = logger().child({ component: 'import' });
    const { downloadId } = Payload.parse(rawPayload);
    await updateDownload(downloadId, { status: 'importing' });
    try {
      const result = await importDownload(downloadId);
      if (result.imported.length > 0) {
        // ONE summary notification per import run — not one per file. Large
        // "complete" packs (dozens of volumes) otherwise emit a notification
        // storm. A duplicate job that found the torrent already gone returns an
        // empty result here, so it neither re-notifies nor cleans up again.
        await safeNotifyImportSummary(downloadId, result.imported.length);
        await safeTriggerRefresh(downloadId);
        // Only clean up the torrent when files actually landed in the library.
        // A "successful" import can still import zero files (everything routed
        // to skips); deleting the torrent (esp. with deleteFiles) then would be
        // data loss with nothing to show for it.
        await maybeCleanupAfterImport(downloadId);
        // Cancel still-active sibling downloads now made redundant by this
        // import (e.g. a duplicate single covering a volume we just got).
        await maybeCancelRedundant(downloadId);
      }
      return result;
    } catch (err) {
      const message = (err as Error).message;
      log.warn({ err: message, downloadId }, 'import job failed');
      await updateDownload(downloadId, { status: 'failed', error: message });
      await safeNotifyFailure('import', downloadId, message);
      throw err;
    }
  },
};

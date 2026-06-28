import { unlink } from 'node:fs/promises';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { libraryFiles, series } from '@/server/db/schema';
import { deleteLibraryFile } from '@/server/db/library-files';
import { markReleaseRejected } from '@/server/db/releases';
import { enqueueJob } from '@/server/db/jobs';
import { resolveLibraryFilePath } from '@/server/reader/path-safety';
import { checkFile } from '@/server/importer/health-check';
import { recordAuditEvent } from '@/server/audit/record';
import type { ContentType } from '@/server/content-type';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({}).passthrough();

export type LibraryHealthScanResult = {
  scanned: number;
  bad: number;
  deleted: number;
  inconclusive: number;
  seriesRequeued: number;
  errors: string[];
};

type ScanRow = {
  id: number;
  path: string;
  seriesId: number;
  volumeId: number | null;
  sourceReleaseId: number | null;
  contentType: ContentType;
};

/**
 * Library health-scan.
 *
 * Opens every `library_files` row with the reader probers and remediates
 * corrupt / wrong-format content. SAFETY-CRITICAL: it acts destructively ONLY
 * on `checkFile` → `status:'bad'`. A `status:'inconclusive'` result (a checker
 * that couldn't run — e.g. `7z` missing for a `.cbr`, or an IO error) is counted
 * and logged but NEVER touched: deleting on inconclusive could wipe the whole
 * library when the host environment is merely broken. `status:'ok'` is left
 * alone too.
 *
 * For each bad file: warn-log + `library.bad_content` audit event, delete the
 * on-disk file (best-effort, tolerating ENOENT), delete the DB row, blacklist
 * the source release, and remember the series. After the sweep, every affected
 * series gets a `series_release_search` job so auto-grab can fetch a replacement
 * (the volume is now unowned and the bad release is rejected).
 */
export const libraryHealthScanDescriptor: JobKindDescriptor<
  Record<string, unknown>,
  LibraryHealthScanResult
> = {
  kind: 'library_health_scan',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 10,
  handler: async (raw, jobId) => {
    const log = logger().child({ component: 'library_health_scan', jobId });
    Payload.parse(raw);

    const rows: ScanRow[] = await getDb()
      .select({
        id: libraryFiles.id,
        path: libraryFiles.path,
        seriesId: libraryFiles.seriesId,
        volumeId: libraryFiles.volumeId,
        sourceReleaseId: libraryFiles.sourceReleaseId,
        contentType: series.contentType,
      })
      .from(libraryFiles)
      .innerJoin(series, eq(libraryFiles.seriesId, series.id));

    let scanned = 0;
    let bad = 0;
    let deleted = 0;
    let inconclusive = 0;
    const errors: string[] = [];
    const affectedSeries = new Set<number>();

    for (const row of rows) {
      scanned++;

      // Resolve the safe on-disk path (symlink-escape guarded). If the resolver
      // can't produce a path (forbidden / not on disk), fall back to the stored
      // path so checkFile can still classify it (a missing file → bad/missing,
      // which cleanly removes the orphaned row).
      let probePath = row.path;
      try {
        const resolved = await resolveLibraryFilePath(row.id);
        if (resolved.ok) probePath = resolved.path;
      } catch (err) {
        log.warn(
          { libraryFileId: row.id, path: row.path, err: (err as Error).message },
          'library scan: path resolve failed, using stored path',
        );
      }

      let result;
      try {
        result = await checkFile(probePath, row.contentType);
      } catch (err) {
        // A checker should never throw, but if it does treat it as inconclusive
        // — NEVER delete on an unexpected failure.
        const reason = err instanceof Error ? err.message : String(err);
        log.warn(
          { libraryFileId: row.id, path: probePath, reason },
          'library scan: inconclusive (skipped)',
        );
        inconclusive++;
        continue;
      }

      if (result.status === 'ok') continue;

      if (result.status === 'inconclusive') {
        // SAFETY: never delete on inconclusive — only count + log.
        log.warn(
          { libraryFileId: row.id, path: probePath, reason: result.reason },
          'library scan: inconclusive (skipped)',
        );
        inconclusive++;
        continue;
      }

      // status === 'bad' → remediate.
      bad++;
      log.warn(
        {
          libraryFileId: row.id,
          seriesId: row.seriesId,
          volumeId: row.volumeId,
          path: probePath,
          reason: result.reason,
        },
        'bad content found',
      );
      await recordAuditEvent({
        actor: { kind: 'system' },
        action: 'library.bad_content',
        target: { kind: 'library_file', id: String(row.id) },
        metadata: {
          libraryFileId: row.id,
          seriesId: row.seriesId,
          volumeId: row.volumeId,
          sourceReleaseId: row.sourceReleaseId,
          path: probePath,
          reason: result.reason,
        },
      });

      // Delete the on-disk file (best-effort; tolerate a missing file).
      try {
        await unlink(probePath);
      } catch (err) {
        const code = (err as { code?: unknown } | null)?.code;
        if (code !== 'ENOENT') {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ libraryFileId: row.id, path: probePath, err: msg }, 'unlink failed');
          errors.push(`unlink ${row.id}: ${msg}`);
        }
      }

      await deleteLibraryFile(row.id);
      deleted++;

      if (row.sourceReleaseId) {
        await markReleaseRejected(row.sourceReleaseId, result.reason);
      }

      affectedSeries.add(row.seriesId);
    }

    let seriesRequeued = 0;
    for (const seriesId of affectedSeries) {
      try {
        await enqueueJob('series_release_search', { seriesId });
        seriesRequeued++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ seriesId, err: msg }, 'failed to enqueue series_release_search');
        errors.push(`requeue ${seriesId}: ${msg}`);
      }
    }

    log.info(
      { scanned, bad, deleted, inconclusive, seriesRequeued, errors: errors.length },
      'library health scan complete',
    );
    return { scanned, bad, deleted, inconclusive, seriesRequeued, errors };
  },
};

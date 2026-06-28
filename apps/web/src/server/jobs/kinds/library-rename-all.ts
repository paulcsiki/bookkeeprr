import { z } from 'zod';
import { listAllSeries } from '@/server/db/series';
import { applyRenamePlan } from '@/server/importer/rename';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY } from '../types';

// Empty payload — the job operates over the entire library.
const Payload = z.object({}).passthrough();

export type LibraryRenameAllResult = {
  seriesProcessed: number;
  seriesChanged: number;
  filesRenamed: number;
  errors: { seriesId: number; message: string }[];
};

// Bulk on-disk renames across the whole library can take a while; give it a
// generous ceiling rather than the default per-job timeout.
const LIBRARY_RENAME_ALL_TIMEOUT_MS = 30 * 60_000;

export const libraryRenameAllDescriptor: JobKindDescriptor<
  Record<string, never>,
  LibraryRenameAllResult
> = {
  kind: 'library_rename_all',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: LIBRARY_RENAME_ALL_TIMEOUT_MS,
  handler: async (rawPayload, jobId) => {
    const log = logger().child({ component: 'library_rename_all', jobId });
    Payload.parse(rawPayload);

    const all = await listAllSeries();
    const result: LibraryRenameAllResult = {
      seriesProcessed: 0,
      seriesChanged: 0,
      filesRenamed: 0,
      errors: [],
    };

    for (const s of all) {
      result.seriesProcessed++;
      try {
        const res = await applyRenamePlan(s.id);
        if (res.renamed > 0) {
          result.seriesChanged++;
          result.filesRenamed += res.renamed;
        }
        // Per-file errors from a single series are recorded but do not abort.
        for (const e of res.errors) {
          result.errors.push({ seriesId: s.id, message: e.message });
        }
      } catch (err) {
        // A failure on one series must not abort the rest of the run.
        const message = err instanceof Error ? err.message : String(err);
        log.warn({ seriesId: s.id, err }, 'rename failed for series, continuing');
        result.errors.push({ seriesId: s.id, message });
      }
    }

    log.info(
      {
        seriesProcessed: result.seriesProcessed,
        seriesChanged: result.seriesChanged,
        filesRenamed: result.filesRenamed,
        errors: result.errors.length,
      },
      'library rename-all complete',
    );
    return result;
  },
};

import { z } from 'zod';
import { basename } from 'node:path';
import { walk } from '@/server/scanner/walk';
import { parseFilename } from '@/server/parser/filename';
import { searchMangaCached } from '@/server/integrations/anilist/cache';
import { getSeriesByAniListId } from '@/server/db/series';
import {
  getScanMatchByPath,
  insertScanMatch,
  updateScanMatchByPath,
} from '@/server/db/scan-matches';
import { getAllLibraryRoots } from '@/server/content-type/paths';
import { logger } from '@/server/logger';
import type { SearchHit } from '@/server/integrations/anilist/schemas';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({
  rootPath: z.string().min(1),
  targetGroupId: z.number().int().positive().optional(),
  structure: z.enum(['flat', 'mirror']).optional(),
});

export const libraryScanDescriptor: JobKindDescriptor<
  { rootPath: string; targetGroupId?: number; structure?: 'flat' | 'mirror' },
  { scanned: number; matched: number }
> = {
  kind: 'library_scan',
  retryPolicy: { maxAttempts: 1 },
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (rawPayload, jobId) => {
    const log = logger().child({ component: 'library_scan', jobId });
    const { rootPath, targetGroupId, structure } = Payload.parse(rawPayload);

    // Walk every configured per-type library root, plus the explicit payload root
    // (legacy single-root callers / manual scans). Deduped so a root shared by
    // several content types — or one that matches the payload — is scanned once.
    const deduped: string[] = [];
    const seenRoots = new Set<string>();
    for (const r of [rootPath, ...(await getAllLibraryRoots())]) {
      if (!seenRoots.has(r)) {
        seenRoots.add(r);
        deduped.push(r);
      }
    }
    // Drop any root that is nested under another root in the set — `walk` recurses,
    // so e.g. the default `/media/comics` is already covered by a `/media` payload
    // root. Without this, files under it would be scanned (and matched) twice.
    const roots = deduped.filter(
      (r) => !deduped.some((other) => other !== r && r.startsWith(other.replace(/\/+$/, '') + '/')),
    );

    const dirCache = new Map<string, SearchHit | null>();
    let scanned = 0;
    let matched = 0;

    for (const root of roots) {
      let rootScanned = 0;
      let rootMatched = 0;
      try {
        for await (const { directory, files } of walk(root)) {
          const dirname = basename(directory);
          let aniMatch = dirCache.get(directory);
          if (aniMatch === undefined) {
            try {
              const hits = await searchMangaCached(dirname);
              aniMatch = hits[0] ?? null;
            } catch (err) {
              log.warn({ dirname, err }, 'anilist lookup failed; leaving directory unmatched');
              aniMatch = null;
            }
            dirCache.set(directory, aniMatch);
          }
          const existing = aniMatch ? await getSeriesByAniListId(aniMatch.anilistId) : null;
          const proposedSeriesId = existing?.id ?? null;

          for (const file of files) {
            rootScanned++;
            const prior = await getScanMatchByPath(file);
            if (prior?.status === 'confirmed' || prior?.status === 'rejected') continue;

            const parsed = parseFilename(basename(file));
            const patch = {
              proposedSeriesId,
              proposedVolume: parsed.volume,
              proposedChapter: parsed.chapter,
              confidence: parsed.confidence,
              parserDebugJson: JSON.stringify({ parsed, aniListMatch: aniMatch, dirname }),
              // Scan-session params for confirm-time group assignment. A rescan
              // refreshes them on pending rows so the LATEST scan's target/structure
              // wins (and a param-less rescan resets them to legacy behavior).
              scanRootPath: rootPath,
              targetGroupId: targetGroupId ?? null,
              structure: structure ?? null,
            };
            if (prior) {
              await updateScanMatchByPath(file, patch);
            } else {
              await insertScanMatch({ filePath: file, ...patch });
            }
            if (aniMatch) rootMatched++;
          }
        }
      } catch (err) {
        // A missing / unreadable root (e.g. an unmounted drive) must not abort the
        // whole scan — log and carry on with the remaining roots.
        log.warn({ root, err }, 'library scan: root failed, skipping');
        continue;
      }
      log.info({ root, scanned: rootScanned, matched: rootMatched }, 'library scan: root complete');
      scanned += rootScanned;
      matched += rootMatched;
    }

    log.info({ roots, scanned, matched }, 'library scan complete');
    return { scanned, matched };
  },
};

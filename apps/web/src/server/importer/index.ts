import { existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { withWriteLock } from '@/server/db/write-lock';
import { libraryFiles, volumes, chapters } from '@/server/db/schema';
import { getDownload, updateDownload } from '@/server/db/downloads';
import { getRelease, markReleaseRejected } from '@/server/db/releases';
import { getSeries } from '@/server/db/series';
import { groupPath } from '@/server/db/library-groups';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { getAllNamingTemplates } from '@/server/db/settings/naming';
import {
  listTorrentsInCategory,
  getTorrentFiles,
  QbittorrentError,
} from '@/server/integrations/qbittorrent';
import { countLibraryFilesByReleaseId } from '@/server/db/library-files';
import { routeFilesWithExtract, type Granularity } from './routing';
import {
  hardlinkOrCopy,
  needsHash,
  resolveDestination,
  sha1OfFile,
  type Comparison,
} from './fs-ops';
import { render, type NamingContext } from '@/server/naming/engine';
import { getLibraryDir, getQbtCategory } from '@/server/content-type/paths';
import { recordActivity } from '@/server/db/activity-events';
import { recordAuditEvent } from '@/server/audit/record';
import { checkFiles } from './health-check';
import { HealthCheckError } from './errors';
import { logger } from '@/server/logger';

export type ImportResult = {
  imported: {
    libraryFileId: number;
    path: string;
    targetKind: 'volume' | 'chapter';
    targetNumber: number;
  }[];
  skipped: {
    reason: 'unmatched' | 'idempotent-hash-match' | 'no-target-row';
    sourceName: string;
  }[];
  conflicts: { sourceName: string; resolvedPath: string }[];
  failed: { sourceName: string; error: string }[];
};

function buildContext(
  series: NonNullable<Awaited<ReturnType<typeof getSeries>>>,
  seriesGroupPath: string[],
  release: NonNullable<Awaited<ReturnType<typeof getRelease>>>,
  target: NamingContext['target'],
  sourceExt: string,
): NamingContext {
  return {
    series: {
      english: series.titleEnglish,
      romaji: series.titleRomaji,
      native: series.titleNative,
      anilistId: series.anilistId,
      year: null,
      groupPath: seriesGroupPath,
    },
    release: {
      group: release.groupName,
      language: (release.language as 'en' | 'jp' | null) ?? null,
    },
    target,
    source: { ext: sourceExt },
  };
}

export async function importDownload(downloadId: number): Promise<ImportResult> {
  const log = logger().child({ component: 'importer', downloadId });
  const result: ImportResult = { imported: [], skipped: [], conflicts: [], failed: [] };

  // Load download
  const download = await getDownload(downloadId);
  if (!download) throw new Error(`importer: download ${downloadId} not found`);

  // Idempotency check
  if (download.status === 'imported') return result;

  // Load release + series
  const release = await getRelease(download.releaseId);
  if (!release) throw new Error(`importer: release ${download.releaseId} not found`);
  if (release.seriesId === null) throw new Error('importer: release orphaned (no seriesId)');
  const series = await getSeries(release.seriesId);
  if (!series) throw new Error(`importer: series ${release.seriesId} not found`);

  // Verify qBT config
  const cfg = await qbtConnectionSetting.get();
  if (!isQbtConfigured(cfg)) throw new Error('importer: qbt not configured');

  // Read naming templates
  const templates = await getAllNamingTemplates(series.contentType);

  // Fetch torrent list + files from qBT. List by the series' resolved category
  // (NOT a hardcoded one) so non-manga / custom-category torrents are found.
  const torrents = await listTorrentsInCategory(cfg, await getQbtCategory(series.contentType));
  const torrent = torrents.find((t) => t.hash === download.qbtHash);

  // The torrent can be gone from qBit when the after_import cleanup policy
  // already removed it (e.g. duplicate import jobs queued during a qBit
  // outage: the first run imports + deletes the torrent, the rest find it
  // missing). Treat "missing torrent" as a no-op IFF this release was already
  // imported (library_files exist) — neither failing nor re-notifying. Only a
  // genuinely-missing torrent with nothing ever imported is a real error.
  const onTorrentGone = async (err: Error): Promise<ImportResult> => {
    const alreadyImported = (await countLibraryFilesByReleaseId(release.id)) > 0;
    if (alreadyImported) {
      log.info(
        { hash: download.qbtHash, releaseId: release.id },
        'torrent gone but release already imported; no-op',
      );
      return result;
    }
    throw err;
  };

  if (!torrent) {
    return onTorrentGone(new Error(`importer: torrent ${download.qbtHash} not found in qbt`));
  }

  let files: Awaited<ReturnType<typeof getTorrentFiles>>;
  try {
    files = await getTorrentFiles(cfg, download.qbtHash);
  } catch (err) {
    const e = err as Error;
    const isNotFound =
      e instanceof QbittorrentError && (e.status === 404 || /not.?found|404/i.test(e.message));
    if (isNotFound) return onTorrentGone(e);
    throw err;
  }

  if (files.length === 0) throw new Error('importer: qbt reported no files');

  // Route files
  const granularity = series.granularity as Granularity;
  const routing = await routeFilesWithExtract(
    release,
    granularity,
    files,
    (f) => join(torrent.save_path, f.name),
    series.contentType,
  );
  for (const s of routing.skipped) {
    result.skipped.push({ reason: s.reason, sourceName: s.sourceName });
  }

  // Content health-check gate. Open each routed file with the reader probers
  // BEFORE anything is moved or inserted. The check is fail-open: it rejects
  // ONLY when a file is provably `bad` (corrupt / wrong-format / unknown).
  // `inconclusive` files (e.g. the 7z binary couldn't run) never flip `ok`, so a
  // broken host environment can't block a legitimate import. On a real bad
  // release we blacklist it (so auto-grab skips it and fetches a replacement),
  // record an audit event, and abort the whole import — nothing lands.
  //
  // Guard: only run the health check when at least one file actually routed.
  // Zero-routed (routing miss / unrecognised extensions) is NOT corrupt content —
  // it falls through to the soft "no importable files" failure below, which marks
  // the download failed (retriable) without blacklisting the release.
  if (routing.routed.length > 0) {
    const healthFiles = routing.routed.map((r) => ({
      path: join(torrent.save_path, r.file.name),
      name: r.file.name,
    }));
    const hc = await checkFiles(healthFiles, series.contentType);
    if (!hc.ok) {
      const reason = hc.failures[0]?.reason ?? 'health-check-failed';
      log.warn(
        {
          downloadId,
          releaseId: release.id,
          seriesId: series.id,
          contentType: series.contentType,
          failures: hc.failures,
        },
        'bad release rejected (health check)',
      );
      await recordAuditEvent({
        actor: { kind: 'system' },
        action: 'release.rejected',
        target: { kind: 'release', id: String(release.id) },
        metadata: { seriesId: series.id, downloadId, reason, failures: hc.failures },
      });
      await markReleaseRejected(release.id, reason);
      throw new HealthCheckError(reason, release.id, hc.failures);
    }
  }

  // Build series directory
  const libraryDir = await getLibraryDir(series.contentType);
  const seriesGroupPath = series.groupId != null ? await groupPath(series.groupId) : [];
  const seriesCtxForFolder = buildContext(series, seriesGroupPath, release, {}, '');
  const seriesFolderName = render(templates.series_folder, seriesCtxForFolder);
  const seriesDir = join(libraryDir, seriesFolderName);
  const volumeSubfolderTemplate = templates.volume_subfolder.trim();
  const targetDir = volumeSubfolderTemplate
    ? join(seriesDir, render(volumeSubfolderTemplate, seriesCtxForFolder))
    : seriesDir;

  // Process each routed file
  for (const r of routing.routed) {
    const sourcePath = join(torrent.save_path, r.file.name);
    try {
      const rawExt = extname(r.file.name);
      const ext = (rawExt ? rawExt.replace(/^\./, '') : 'cbz').toLowerCase();

      // Look up volume or chapter row
      let volumeId: number | null = null;
      let chapterId: number | null = null;
      const targetCtx: NamingContext['target'] = {};

      if (r.targetKind === 'volume') {
        const rows = await getDb()
          .select({ id: volumes.id, number: volumes.number })
          .from(volumes)
          .where(and(eq(volumes.seriesId, series.id), eq(volumes.number, r.targetNumber)));
        let found = rows[0];
        if (!found) {
          // Volume-granularity series (e.g. NovelUpdates-anchored light novels)
          // carry no pre-seeded volume count, so the routed volume row may not
          // exist yet. Auto-create it from the parsed release number — inside the
          // write-lock — instead of skipping. Chapter-granularity series keep
          // their existing no-target-row skip (this branch is volume-only).
          if (granularity === 'volume') {
            const newId = await withWriteLock(async () => {
              // Re-check under the lock to avoid a duplicate from a concurrent import.
              const existing = await getDb()
                .select({ id: volumes.id })
                .from(volumes)
                .where(and(eq(volumes.seriesId, series.id), eq(volumes.number, r.targetNumber)));
              if (existing[0]) return existing[0].id;
              const [inserted] = await getDb()
                .insert(volumes)
                .values({ seriesId: series.id, number: r.targetNumber })
                .returning({ id: volumes.id });
              if (!inserted) throw new Error('volume auto-create returned no row');
              return inserted.id;
            });
            found = { id: newId, number: r.targetNumber };
          } else {
            result.skipped.push({ reason: 'no-target-row', sourceName: r.file.name });
            continue;
          }
        }
        volumeId = found.id;
        targetCtx.volume = r.targetNumber;
      } else {
        const rows = await getDb()
          .select({
            id: chapters.id,
            numberSort: chapters.numberSort,
            numberText: chapters.numberText,
          })
          .from(chapters)
          .where(and(eq(chapters.seriesId, series.id), eq(chapters.numberSort, r.targetNumber)));
        const found = rows[0];
        if (!found) {
          result.skipped.push({ reason: 'no-target-row', sourceName: r.file.name });
          continue;
        }
        chapterId = found.id;
        targetCtx.chapter = found.numberText;
      }

      // For batch releases, include chapter_range token
      if (
        release.targetKind === 'batch' &&
        release.targetLow !== null &&
        release.targetHigh !== null
      ) {
        const lo = String(Math.floor(release.targetLow)).padStart(3, '0');
        const hi = String(Math.floor(release.targetHigh)).padStart(3, '0');
        targetCtx.chapterRange = `${lo}-${hi}`;
      }

      const ctx = buildContext(series, seriesGroupPath, release, targetCtx, ext);

      // Choose the right naming template. Prefer the routed item's kind: a
      // volume routed out of a batch (e.g. a "Complete" pack) must use the
      // volume template (so each file gets its volume number), not the batch
      // template, which is chapter-range oriented and would name every file the
      // same. Only chapter batches use the batch template.
      type TemplateKey = 'batch' | 'volume' | 'chapter';
      const templateKey: TemplateKey =
        r.targetKind === 'volume'
          ? 'volume'
          : release.targetKind === 'batch'
            ? 'batch'
            : 'chapter';
      const filename = render(templates[templateKey], ctx);

      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }
      const desiredPath = join(targetDir, filename);

      // Idempotency compare: hash both files regardless of size threshold
      const compare = async (existingPath: string): Promise<Comparison> => {
        if (!existsSync(existingPath)) return 'none';
        try {
          const dstStat = statSync(existingPath);
          if (dstStat.size !== r.file.size) return 'different';
          // Per spec §6.4: always hash for idempotency check
          const srcHash = await sha1OfFile(sourcePath);
          const dstHash = await sha1OfFile(existingPath);
          return srcHash === dstHash ? 'identical' : 'different';
        } catch {
          return 'different';
        }
      };

      const resolved = await resolveDestination(desiredPath, compare);

      if (resolved.action === 'skip-identical') {
        result.skipped.push({ reason: 'idempotent-hash-match', sourceName: r.file.name });
        continue;
      }
      if (resolved.action === 'suffixed') {
        result.conflicts.push({ sourceName: r.file.name, resolvedPath: resolved.path });
      }

      await hardlinkOrCopy(sourcePath, resolved.path);

      // Only store hash in library_files if file exceeds threshold
      let hash: string | null = null;
      if (needsHash(r.file.size)) {
        hash = await sha1OfFile(resolved.path);
      }

      const libraryFileId = await withWriteLock(async () => {
        const [row] = await getDb()
          .insert(libraryFiles)
          .values({
            seriesId: series.id,
            volumeId,
            chapterId,
            path: resolved.path,
            sizeBytes: r.file.size,
            hashSha1: hash,
            sourceReleaseId: release.id,
          })
          .returning({ id: libraryFiles.id });
        if (!row) throw new Error('library_files insert returned no row');
        return row.id;
      });

      result.imported.push({
        libraryFileId,
        path: resolved.path,
        targetKind: r.targetKind,
        targetNumber: r.targetNumber,
      });
    } catch (err) {
      log.warn({ err, file: r.file.name }, 'per-file import failed');
      result.failed.push({
        sourceName: r.file.name,
        error: (err as Error).message,
      });
    }
  }

  // Nothing actually landed in the library — don't pretend success. Mark the
  // download failed with a reason so it surfaces in Activity instead of showing
  // "imported" with an empty library (e.g. an ebook series fed an audio-only
  // torrent, or a pack whose files all skipped).
  if (result.imported.length === 0) {
    const reason =
      routing.routed.length === 0
        ? `no importable files for ${series.contentType} (all ${files.length} skipped)`
        : `import produced no files (${result.failed.length} failed)`;
    await updateDownload(downloadId, { status: 'failed', error: reason });
    return result;
  }

  await updateDownload(downloadId, { status: 'imported', importedAt: new Date() });

  // Activity feed: emit an "imported" event on a successful import. The importer
  // runs in a job with no session, so the event has no user (rendered as a
  // system event). Best-effort — recordActivity never throws into this flow.
  if (result.imported.length > 0) {
    await recordActivity({
      userId: null,
      kind: 'imported',
      seriesId: series.id,
      meta: { count: result.imported.length, releaseId: release.id },
    });
  }
  return result;
}

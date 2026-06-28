import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { jobRetentionSetting, backupRetentionSetting } from '@/server/db/settings/housekeeping';
import { visibilityRetentionSetting } from '@/server/db/settings/visibility-retention';
import { releaseRetentionSetting } from '@/server/db/settings/release-retention';
import { purgeTerminalJobs, listBackupFiles, type BackupFile } from '@/server/db/housekeeping';
import { pruneReleases } from '@/server/db/releases';
import { pruneExpiredSessions } from '@/server/db/sessions';
import { pruneAuditEvents } from '@/server/db/audit';
import { pruneLogFiles } from '@/server/audit/log-files';
import { torrentCleanupSetting } from '@/server/db/settings/library';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { listImportedDownloads } from '@/server/db/downloads';
import { getRelease } from '@/server/db/releases';
import { getSeries, reconcileFutureMonitoring } from '@/server/db/series';
import { getQbtCategory } from '@/server/content-type/paths';
import {
  listTorrentsInCategory,
  deleteTorrent,
  type QbtTorrent,
} from '@/server/integrations/qbittorrent';
import type { ContentType } from '@/server/content-type';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({}).passthrough();

export type HousekeepingResult = {
  jobsPurged: number;
  backupCreated: string | null;
  backupsKept: string[];
  backupsDeleted: string[];
  releasesPruned: number;
  sessionsPruned: number;
  auditPruned: number;
  logsPruned: number;
  torrentsRemoved: number;
  monitoringReconciled: number;
  errors: string[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function configDir(): string {
  return process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config';
}

function dbPath(): string {
  return process.env.BOOKKEEPRR_DB_PATH ?? join(configDir(), 'bookkeeprr.db');
}

async function maybeCreateBackup(): Promise<{ created: string | null; error?: string }> {
  const backupsDir = join(configDir(), 'backups');
  const today = todayIso();
  const target = join(backupsDir, `bookkeeprr-${today}.db`);
  if (existsSync(target)) return { created: null };
  mkdirSync(backupsDir, { recursive: true });
  try {
    const src = new Database(dbPath());
    await (src as unknown as { backup(p: string): Promise<unknown> }).backup(target);
    src.close();
    return { created: target };
  } catch (err) {
    return { created: null, error: (err as Error).message };
  }
}

function selectBackupsToKeep(
  files: BackupFile[],
  retention: { daily: number; monthlyDay1: number },
): Set<string> {
  const keep = new Set<string>();
  files.slice(0, retention.daily).forEach((f) => keep.add(f.path));
  const monthlies = files.filter((f) => f.day === '01').slice(0, retention.monthlyDay1);
  monthlies.forEach((f) => keep.add(f.path));
  return keep;
}

/**
 * Ratio / seed-time torrent cleanup pass. For `after_ratio` / `after_seed_time`
 * policies, look at every `imported` download, find its torrent in qBit, and
 * remove the ones whose ratio / seeding_time meets the configured threshold.
 *
 * Efficiency: imported downloads are grouped by their resolved qBit category
 * (series.contentType → getQbtCategory) so we list each category once and build
 * a single hash→torrent map. Every qBit list/delete error is caught and
 * reported — this pass never throws out of housekeeping.
 *
 * Downloads whose torrent is already gone from qBit (no map entry) are skipped
 * cleanly. `never` / `after_import` policies do nothing here.
 */
async function runTorrentCleanupPass(): Promise<{ removed: number; errors: string[] }> {
  const log = logger().child({ component: 'housekeeping' });
  const errors: string[] = [];
  let removed = 0;

  const policy = await torrentCleanupSetting.get();
  if (policy.mode !== 'after_ratio' && policy.mode !== 'after_seed_time') {
    return { removed, errors };
  }
  const cfg = await qbtConnectionSetting.get();
  if (!isQbtConfigured(cfg)) return { removed, errors };

  // Thresholds are skipped entirely if the relevant bound is unset.
  if (policy.mode === 'after_ratio' && policy.ratio === undefined) return { removed, errors };
  if (policy.mode === 'after_seed_time' && policy.seedMinutes === undefined) {
    return { removed, errors };
  }

  const imported = await listImportedDownloads();
  if (imported.length === 0) return { removed, errors };

  // Resolve each imported download's content type, then group by category.
  const categoryByHash = new Map<string, string>();
  const categories = new Set<string>();
  for (const d of imported) {
    const release = await getRelease(d.releaseId);
    if (!release || release.seriesId === null) continue;
    const seriesRow = await getSeries(release.seriesId);
    if (!seriesRow) continue;
    const cat = await getQbtCategory(seriesRow.contentType as ContentType);
    categoryByHash.set(d.qbtHash, cat);
    categories.add(cat);
  }
  if (categories.size === 0) return { removed, errors };

  // List each category once; build hash → torrent map.
  const torrentByHash = new Map<string, QbtTorrent>();
  for (const cat of categories) {
    try {
      const torrents = await listTorrentsInCategory(cfg, cat);
      for (const t of torrents) torrentByHash.set(t.hash, t);
    } catch (err) {
      errors.push(`cleanup-list ${cat}: ${(err as Error).message}`);
    }
  }

  const threshold =
    policy.mode === 'after_ratio' ? (policy.ratio as number) : (policy.seedMinutes as number) * 60;

  for (const d of imported) {
    const torrent = torrentByHash.get(d.qbtHash);
    if (!torrent) continue; // torrent already gone from qBit → skip cleanly
    const metric = policy.mode === 'after_ratio' ? torrent.ratio : torrent.seeding_time;
    if (metric < threshold) continue;
    try {
      await deleteTorrent(cfg, d.qbtHash, { deleteFiles: policy.deleteFiles });
      removed++;
      log.info(
        { hash: d.qbtHash, mode: policy.mode, metric, deleteFiles: policy.deleteFiles },
        'removed torrent (cleanup policy)',
      );
    } catch (err) {
      errors.push(`cleanup-delete ${d.qbtHash}: ${(err as Error).message}`);
    }
  }

  return { removed, errors };
}

export const housekeepingDescriptor: JobKindDescriptor<
  Record<string, unknown>,
  HousekeepingResult
> = {
  kind: 'housekeeping',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 5,
  handler: async (raw) => {
    const log = logger().child({ component: 'housekeeping' });
    Payload.parse(raw);
    const errors: string[] = [];

    // 1) Purge terminal jobs
    let jobsPurged = 0;
    try {
      const retention = await jobRetentionSetting.get();
      jobsPurged = await purgeTerminalJobs(retention);
    } catch (err) {
      errors.push(`purge: ${(err as Error).message}`);
    }

    // 2) Create today's backup (if missing)
    const backup = await maybeCreateBackup();
    if (backup.error) errors.push(`backup: ${backup.error}`);

    // 3) Prune backups
    const backupsKept: string[] = [];
    const backupsDeleted: string[] = [];
    try {
      const retention = await backupRetentionSetting.get();
      const files = listBackupFiles(join(configDir(), 'backups'));
      const keep = selectBackupsToKeep(files, retention);
      for (const f of files) {
        if (keep.has(f.path)) {
          backupsKept.push(f.path);
        } else {
          try {
            unlinkSync(f.path);
            backupsDeleted.push(f.path);
          } catch (err) {
            errors.push(`prune ${f.path}: ${(err as Error).message}`);
          }
        }
      }
    } catch (err) {
      errors.push(`prune: ${(err as Error).message}`);
    }

    // 4) Prune old releases (age + rank + not downloaded)
    let releasesPruned = 0;
    try {
      const releaseRetention = await releaseRetentionSetting.get();
      const r = await pruneReleases(releaseRetention);
      releasesPruned = r.deletedCount;
      log.info({ deletedCount: releasesPruned, ...releaseRetention }, 'pruned old releases');
    } catch (err) {
      const msg = (err as Error).message;
      log.warn({ err: msg }, 'pruneReleases failed; continuing');
      errors.push(`prune: ${msg}`);
    }

    // 5) Prune expired sessions
    let sessionsPruned = 0;
    try {
      sessionsPruned = await pruneExpiredSessions();
      log.info({ count: sessionsPruned }, 'pruned expired sessions');
    } catch (err) {
      const msg = (err as Error).message;
      log.warn({ err: msg }, 'pruneExpiredSessions failed; continuing');
      errors.push(`prune-sessions: ${msg}`);
    }

    // 6) Prune audit events + rotated log files
    const visCfg = await visibilityRetentionSetting.get();
    let auditPruned = 0;
    let logsPruned = 0;
    try {
      auditPruned = await pruneAuditEvents(
        new Date(Date.now() - visCfg.auditRetentionDays * 24 * 60 * 60 * 1000),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'pruneAuditEvents failed; continuing');
      errors.push(`prune-audit: ${msg}`);
    }
    try {
      logsPruned = await pruneLogFiles(visCfg.logRetentionDays);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'pruneLogFiles failed; continuing');
      errors.push(`prune-logs: ${msg}`);
    }

    // 7) Torrent cleanup (after_ratio / after_seed_time). Resilient: never throws.
    let torrentsRemoved = 0;
    try {
      const cleanup = await runTorrentCleanupPass();
      torrentsRemoved = cleanup.removed;
      errors.push(...cleanup.errors);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'torrent cleanup pass failed; continuing');
      errors.push(`torrent-cleanup: ${msg}`);
    }

    // 8) Auto-monitoring: drop `future` → `none` for finished / single-book
    // series that can never receive a future release.
    let monitoringReconciled = 0;
    try {
      monitoringReconciled = await reconcileFutureMonitoring();
      if (monitoringReconciled > 0) {
        log.info({ count: monitoringReconciled }, 'reconciled future→none monitoring');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'monitoring reconcile failed; continuing');
      errors.push(`monitoring-reconcile: ${msg}`);
    }

    log.info(
      {
        jobsPurged,
        backupCreated: backup.created,
        kept: backupsKept.length,
        deleted: backupsDeleted.length,
        releasesPruned,
        sessionsPruned,
        auditPruned,
        logsPruned,
        torrentsRemoved,
        monitoringReconciled,
        errors: errors.length,
      },
      'housekeeping complete',
    );
    return {
      jobsPurged,
      backupCreated: backup.created,
      backupsKept,
      backupsDeleted,
      releasesPruned,
      sessionsPruned,
      auditPruned,
      logsPruned,
      torrentsRemoved,
      monitoringReconciled,
      errors,
    };
  },
};

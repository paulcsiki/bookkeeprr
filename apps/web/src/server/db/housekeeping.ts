import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { and, inArray, lt, eq, or, sql } from 'drizzle-orm';
import { getDb } from './client';
import { jobs, type JobRow } from './schema';
import { withWriteLock } from './write-lock';

export type RetentionConfig = { terminalDays: number; errorDays: number };

type JobStatus = JobRow['status'];
const TERMINAL_NON_ERROR: JobStatus[] = ['completed', 'interrupted', 'cancelled'];

export async function purgeTerminalJobs(retention: RetentionConfig): Promise<number> {
  const now = Date.now();
  const terminalCutoff = new Date(now - retention.terminalDays * 24 * 60 * 60 * 1000);
  const errorCutoff = new Date(now - retention.errorDays * 24 * 60 * 60 * 1000);

  return withWriteLock(async () => {
    const db = getDb();

    const whereClause = or(
      and(inArray(jobs.status, TERMINAL_NON_ERROR), lt(jobs.finishedAt, terminalCutoff)),
      and(eq(jobs.status, 'failed'), lt(jobs.finishedAt, errorCutoff)),
    );

    // Count before delete so we can return the row count without relying on
    // RunResult.changes (whose TypeScript type isn't exposed by Drizzle ORM).
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(whereClause);

    const count = countRow?.count ?? 0;
    if (count === 0) return 0;

    await db.delete(jobs).where(whereClause);
    return count;
  });
}

export type BackupFile = { path: string; date: string; day: string; mtime: number };

const BACKUP_RE = /^bookkeeprr-(\d{4})-(\d{2})-(\d{2})\.db$/;

export function listBackupFiles(dir: string): BackupFile[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const out: BackupFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const m = entry.name.match(BACKUP_RE);
    if (!m) continue;
    const [, y, mo, d] = m;
    out.push({
      path: join(dir, entry.name),
      date: `${y}-${mo}-${d}`,
      day: d!,
      mtime: 0,
    });
  }
  // ISO date string lexicographic sort → correct date order
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

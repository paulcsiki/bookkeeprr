import { and, eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { scanMatches, type ScanMatchRow } from './schema';
import { withWriteLock } from './write-lock';

export type ScanMatchCreate = {
  filePath: string;
  proposedSeriesId?: number | null;
  proposedVolume?: number | null;
  proposedChapter?: string | null;
  confidence?: number;
  parserDebugJson?: string;
  scanRootPath?: string | null;
  targetGroupId?: number | null;
  structure?: 'flat' | 'mirror' | null;
};

export type ScanMatchUpdate = Partial<{
  status: 'pending' | 'confirmed' | 'rejected' | 'skipped';
  proposedSeriesId: number | null;
  proposedVolume: number | null;
  proposedChapter: string | null;
  confidence: number;
  parserDebugJson: string;
  scanRootPath: string | null;
  targetGroupId: number | null;
  structure: 'flat' | 'mirror' | null;
  reviewedAt: Date | null;
}>;

export async function insertScanMatch(input: ScanMatchCreate): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(scanMatches)
      .values({
        filePath: input.filePath,
        proposedSeriesId: input.proposedSeriesId ?? null,
        proposedVolume: input.proposedVolume ?? null,
        proposedChapter: input.proposedChapter ?? null,
        confidence: input.confidence ?? 0,
        parserDebugJson: input.parserDebugJson ?? '{}',
        scanRootPath: input.scanRootPath ?? null,
        targetGroupId: input.targetGroupId ?? null,
        structure: input.structure ?? null,
      })
      .returning({ id: scanMatches.id });
    if (!row) throw new Error('insertScanMatch: insert returned no row');
    return row.id;
  });
}

export async function getScanMatch(id: number): Promise<ScanMatchRow | null> {
  const rows = await getDb().select().from(scanMatches).where(eq(scanMatches.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listPendingScanMatches(): Promise<ScanMatchRow[]> {
  return getDb().select().from(scanMatches).where(eq(scanMatches.status, 'pending'));
}

export async function updateScanMatch(id: number, patch: ScanMatchUpdate): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await withWriteLock(() => getDb().update(scanMatches).set(patch).where(eq(scanMatches.id, id)));
}

export async function deleteScanMatch(id: number): Promise<void> {
  await withWriteLock(() => getDb().delete(scanMatches).where(eq(scanMatches.id, id)));
}

export async function getScanMatchByPath(filePath: string): Promise<ScanMatchRow | null> {
  const rows = await getDb()
    .select()
    .from(scanMatches)
    .where(eq(scanMatches.filePath, filePath))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateScanMatchByPath(
  filePath: string,
  patch: ScanMatchUpdate,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await withWriteLock(() =>
    getDb().update(scanMatches).set(patch).where(eq(scanMatches.filePath, filePath)),
  );
}

export async function listPendingByDirectoryPrefix(directory: string): Promise<ScanMatchRow[]> {
  const prefix = directory.endsWith('/') ? directory : directory + '/';
  const escaped = prefix.replace(/[%_\\]/g, (c) => `\\${c}`) + '%';
  return getDb()
    .select()
    .from(scanMatches)
    .where(
      and(
        eq(scanMatches.status, 'pending'),
        sql`${scanMatches.filePath} LIKE ${escaped} ESCAPE '\\'`,
      ),
    );
}

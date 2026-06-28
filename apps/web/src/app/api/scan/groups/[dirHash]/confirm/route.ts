import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import {
  scanMatches,
  libraryFiles,
  volumes,
  chapters,
  type ScanMatchRow,
} from '@/server/db/schema';
import { dirHash } from '@/lib/dir-hash';
import { getSeriesByAniListId, insertSeries } from '@/server/db/series';
import { createGroup, listGroups } from '@/server/db/library-groups';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles';
import { enqueueJob } from '@/server/db/jobs';
import { logger } from '@/server/logger';
import { withWriteLock } from '@/server/db/write-lock';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

type AniListStash = {
  anilistId?: number;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  coverUrl?: string | null;
  status?: 'releasing' | 'finished' | 'hiatus' | 'cancelled';
} | null;

type Stash = { aniListMatch?: AniListStash };

function parseStash(json: string): Stash {
  try {
    return JSON.parse(json) as Stash;
  } catch {
    return {};
  }
}

type RouteContext = { params: Promise<{ dirHash: string }> };

async function findOrCreateGroup(name: string, parentId: number | null): Promise<number> {
  const find = async () =>
    (await listGroups()).find((g) => g.name === name && g.parentId === parentId);
  const existing = await find();
  if (existing) return existing.id;
  try {
    return (await createGroup(name, parentId)).id;
  } catch (err) {
    // createGroup throws on a sibling-name conflict — another confirm in the
    // same session beat us to it. Re-find; anything else is a real error.
    const raced = await find();
    if (raced) return raced.id;
    throw err;
  }
}

/**
 * Confirm-time group assignment for NEWLY created series (pre-existing matched
 * series keep their group — never moved by an import).
 * - flat (or no session params): the scan's targetGroupId (null = library root).
 * - mirror: the series directory's path relative to the scan root — minus the
 *   series folder itself — materializes as nested groups under the target.
 *   Series folders directly at the scan root land in the target itself.
 */
async function resolveImportGroup(row: ScanMatchRow): Promise<number | null> {
  const target = row.targetGroupId ?? null;
  if (row.structure !== 'mirror' || !row.scanRootPath) return target;
  const seriesDir = dirname(row.filePath);
  const rel = relative(row.scanRootPath, seriesDir);
  // Files outside the scan root (e.g. another library root swept by the same
  // job) get the flat behavior — never materialize '..' segments as groups.
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return target;
  const segments = rel.split(sep).filter(Boolean);
  segments.pop(); // the series folder itself is the series, not a group
  let parentId: number | null = target;
  for (const name of segments) {
    parentId = await findOrCreateGroup(name, parentId);
  }
  return parentId;
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { dirHash: targetHash } = await ctx.params;

  const allPending = (await getDb()
    .select()
    .from(scanMatches)
    .where(eq(scanMatches.status, 'pending'))) as ScanMatchRow[];
  const groupRows = allPending.filter((r) => dirHash(dirname(r.filePath)) === targetHash);
  if (groupRows.length === 0) {
    return NextResponse.json({ error: 'group not found or already resolved' }, { status: 404 });
  }

  let proposedSeriesId: number | null = null;
  let stashAnilistId: number | null = null;
  let stashTitleRomaji: string | null = null;
  let stashTitleEnglish: string | null = null;
  let stashTitleNative: string | null = null;
  let stashCoverUrl: string | null = null;
  let stashStatus: 'releasing' | 'finished' | 'hiatus' | 'cancelled' | null = null;

  for (const r of groupRows) {
    if (r.proposedSeriesId !== null && proposedSeriesId === null)
      proposedSeriesId = r.proposedSeriesId;
    const m = parseStash(r.parserDebugJson).aniListMatch ?? null;
    if (m && typeof m.anilistId === 'number' && stashAnilistId === null) {
      stashAnilistId = m.anilistId;
      stashTitleRomaji = m.titleRomaji ?? null;
      stashTitleEnglish = m.titleEnglish ?? null;
      stashTitleNative = m.titleNative ?? null;
      stashCoverUrl = m.coverUrl ?? null;
      stashStatus = m.status ?? null;
    }
  }

  if (proposedSeriesId === null && stashAnilistId === null) {
    return NextResponse.json({ error: 'match required before confirm' }, { status: 400 });
  }

  const directory = dirname(groupRows[0]!.filePath);
  const hasChapter = groupRows.some((r) => r.proposedChapter !== null);
  const inferredGranularity: 'volume' | 'chapter' = hasChapter ? 'chapter' : 'volume';

  let seriesId: number;
  let createdNewSeries = false;
  if (proposedSeriesId !== null) {
    seriesId = proposedSeriesId;
  } else {
    const existing = await getSeriesByAniListId(stashAnilistId!);
    if (existing) {
      seriesId = existing.id;
    } else {
      const qpId = await seedDefaultQualityProfile();
      const groupId = await resolveImportGroup(groupRows[0]!);
      seriesId = await insertSeries({
        groupId,
        anilistId: stashAnilistId!,
        status: stashStatus ?? 'releasing',
        rootPath: directory,
        qualityProfileId: qpId,
        titleEnglish: stashTitleEnglish,
        titleRomaji: stashTitleRomaji,
        titleNative: stashTitleNative,
        coverUrl: stashCoverUrl,
        monitoring: 'none',
        granularity: inferredGranularity,
      });
      createdNewSeries = true;
    }
  }

  // Pre-compute file sizes outside the transaction (fs.stat is async)
  const sizesByPath = new Map<string, number>();
  for (const r of groupRows) {
    try {
      const st = await fs.stat(r.filePath);
      sizesByPath.set(r.filePath, st.size);
    } catch (err) {
      logger().warn(
        { filePath: r.filePath, err },
        'confirm: fs.stat failed, falling back to sizeBytes=0',
      );
      sizesByPath.set(r.filePath, 0);
    }
  }

  let importedCount = 0;
  let skippedCount = 0;

  await withWriteLock(() =>
    getDb().transaction((tx) => {
      for (const r of groupRows) {
        let volumeId: number | null = null;
        let chapterId: number | null = null;
        if (r.proposedVolume !== null) {
          const v = tx
            .select()
            .from(volumes)
            .where(and(eq(volumes.seriesId, seriesId), eq(volumes.number, r.proposedVolume)))
            .limit(1)
            .all();
          volumeId = v[0]?.id ?? null;
        } else if (r.proposedChapter !== null && /^\d+(?:\.\d+)?$/.test(r.proposedChapter)) {
          const ns = parseFloat(r.proposedChapter);
          const c = tx
            .select()
            .from(chapters)
            .where(and(eq(chapters.seriesId, seriesId), eq(chapters.numberSort, ns)))
            .limit(1)
            .all();
          chapterId = c[0]?.id ?? null;
        }

        const sizeBytes = sizesByPath.get(r.filePath) ?? 0;

        try {
          tx.insert(libraryFiles)
            .values({
              seriesId,
              volumeId,
              chapterId,
              path: r.filePath,
              sizeBytes,
              sourceReleaseId: null,
            })
            .run();
          importedCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/UNIQUE constraint failed/i.test(msg)) {
            skippedCount++;
          } else {
            throw err;
          }
        }

        tx.update(scanMatches)
          .set({ status: 'confirmed', reviewedAt: new Date(), proposedSeriesId: seriesId })
          .where(eq(scanMatches.id, r.id))
          .run();
      }
    }),
  );

  if (createdNewSeries && importedCount > 0) {
    await enqueueJob('metadata_hydrate', { seriesId });
    await enqueueJob('mangadex_chapter_sync', { seriesId });
  }

  const actor = await auditActor(req);
  await recordAuditEvent({
    actor,
    action: 'scan.group_confirm',
    target: { kind: 'scan_group', id: targetHash },
    metadata: { seriesId, importedCount, skippedCount },
    context: auditContext(req),
  });

  return NextResponse.json({ seriesId, importedCount, skippedCount }, { status: 200 });
}

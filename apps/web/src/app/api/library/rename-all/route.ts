import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { enqueueJob } from '@/server/db/jobs';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';
import { listAllSeries } from '@/server/db/series';
import { computeRenamePlan } from '@/server/importer/rename';

export const dynamic = 'force-dynamic';

export type LibraryRenamePreviewSeries = {
  seriesId: number;
  title: string;
  folder: { current: string; proposed: string; changed: boolean };
  files: { libraryFileId: number; currentPath: string; proposedPath: string }[];
};

export type LibraryRenamePreview = {
  series: LibraryRenamePreviewSeries[];
  seriesChanged: number;
  totalChanges: number;
};

/**
 * GET /api/library/rename-all — admin-only dry-run.
 *
 * Computes the rename plan for every series (reusing the same per-series
 * `computeRenamePlan` the apply path runs) and returns only those with pending
 * changes. Nothing is written to disk; this powers the bulk preview UI.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const all = await listAllSeries();
  const changed: LibraryRenamePreviewSeries[] = [];
  let totalChanges = 0;

  for (const s of all) {
    let plan;
    try {
      plan = await computeRenamePlan(s.id);
    } catch {
      // A series whose plan can't be computed is skipped from the preview; the
      // apply job records the failure separately.
      continue;
    }
    const changes = (plan.folder.changed ? 1 : 0) + plan.files.length;
    if (changes === 0) continue;
    totalChanges += changes;
    changed.push({
      seriesId: s.id,
      title: s.titleEnglish ?? s.titleRomaji ?? `Series ${s.id}`,
      folder: plan.folder,
      files: plan.files,
    });
  }

  const preview: LibraryRenamePreview = {
    series: changed,
    seriesChanged: changed.length,
    totalChanges,
  };
  return NextResponse.json(preview);
}

/**
 * POST /api/library/rename-all — admin-only.
 *
 * Enqueues a background `library_rename_all` job that re-applies the naming
 * templates to every series on disk. Returns the job id; progress is visible
 * in Activity.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const jobId = await enqueueJob('library_rename_all', {});
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'library.rename-all',
    metadata: { jobId },
    context: auditContext(req),
  });
  return NextResponse.json({ jobId }, { status: 202 });
}

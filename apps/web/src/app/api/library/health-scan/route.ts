import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/require-admin';
import { enqueueJob } from '@/server/db/jobs';
import { getDb } from '@/server/db/client';
import { jobs } from '@/server/db/schema';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

/**
 * POST /api/library/health-scan — admin-only (cookie or mobile bearer).
 *
 * Enqueues a background `library_health_scan` job that opens every library file
 * with the reader probers and deletes / re-grabs corrupt or wrong-format
 * content. Returns the job id; progress is visible in Activity. If a scan is
 * already pending/running, returns 409 with the existing job id (mirrors the
 * library-scan guard).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const inflight = await getDb()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.kind, 'library_health_scan'), inArray(jobs.status, ['pending', 'running'])))
    .limit(1);
  if (inflight.length > 0) {
    return NextResponse.json(
      { error: 'a library_health_scan is already in progress', existingJobId: inflight[0]!.id },
      { status: 409 },
    );
  }

  const jobId = await enqueueJob('library_health_scan', {});
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'library.health-scan',
    metadata: { jobId },
    context: auditContext(req),
  });
  return NextResponse.json({ jobId }, { status: 202 });
}

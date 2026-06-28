import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { enqueueJob } from '@/server/db/jobs';
import { getDb } from '@/server/db/client';
import { jobs } from '@/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { ScanStartBody } from '@/server/openapi/schemas/scan';
import { getGroup } from '@/server/db/library-groups';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  let parsed;
  try {
    parsed = ScanStartBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid payload', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  try {
    await fs.access(parsed.rootPath);
  } catch {
    return NextResponse.json(
      { error: 'rootPath not readable', detail: parsed.rootPath },
      { status: 400 },
    );
  }

  if (parsed.targetGroupId !== undefined && (await getGroup(parsed.targetGroupId)) === null) {
    return NextResponse.json(
      {
        error: 'invalid targetGroupId',
        detail: `library group ${parsed.targetGroupId} does not exist`,
      },
      { status: 422 },
    );
  }

  const inflight = await getDb()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.kind, 'library_scan'), inArray(jobs.status, ['pending', 'running'])))
    .limit(1);
  if (inflight.length > 0) {
    return NextResponse.json(
      { error: 'a library_scan is already in progress', existingJobId: inflight[0]!.id },
      { status: 409 },
    );
  }

  const jobId = await enqueueJob('library_scan', {
    rootPath: parsed.rootPath,
    targetGroupId: parsed.targetGroupId,
    structure: parsed.structure,
  });
  const actor = await auditActor(req);
  await recordAuditEvent({
    actor,
    action: 'scan.start',
    metadata: { jobId, rootPath: parsed.rootPath },
    context: auditContext(req),
  });
  return NextResponse.json({ jobId }, { status: 202 });
}

import { NextResponse } from 'next/server';
import { dispatchReadarrCommand } from '@/server/readarr/command-dispatcher';
import { listRecentJobs } from '@/server/db/jobs';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

function mapJobStatusToReadarr(
  s: string,
): 'queued' | 'started' | 'completed' | 'failed' | 'aborted' {
  switch (s) {
    case 'pending':
      return 'queued';
    case 'running':
      return 'started';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'interrupted':
      return 'failed';
    case 'cancelled':
      return 'aborted';
    default:
      return 'queued';
  }
}

function toIso(d: Date | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export async function GET(): Promise<NextResponse> {
  const jobs = await listRecentJobs(50);
  return NextResponse.json(
    jobs.map((j) => ({
      id: j.id,
      name: j.kind,
      status: mapJobStatusToReadarr(j.status),
      queued: toIso(j.scheduledFor),
      started: toIso(j.startedAt),
      ended: toIso(j.finishedAt),
      duration: '00:00:00',
      trigger: 'manual',
      message: j.error ?? '',
    })),
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Calibre-Web occasionally POSTs an empty body — treat as no-op.
  }
  const name = typeof body.name === 'string' ? body.name : 'NoOp';
  const result = await dispatchReadarrCommand(name, body);
  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'readarr.command',
    metadata: { name },
    context: auditContext(req),
  });
  const now = new Date().toISOString();
  if (result.kind === 'enqueued') {
    return NextResponse.json(
      {
        id: result.jobId,
        name,
        status: 'queued',
        queued: now,
        started: null,
        ended: null,
        duration: '00:00:00',
        trigger: 'manual',
        message: result.jobKind,
      },
      { status: 201 },
    );
  }
  return NextResponse.json(
    {
      id: 0,
      name,
      status: 'completed',
      queued: now,
      started: now,
      ended: now,
      duration: '00:00:00',
      trigger: 'manual',
      message: result.message,
    },
    { status: 201 },
  );
}

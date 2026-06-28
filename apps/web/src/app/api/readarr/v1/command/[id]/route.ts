import { NextResponse } from 'next/server';
import { getJob } from '@/server/db/jobs';
import { readarrError } from '@/server/readarr/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

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

function durationBetween(start: Date | null | undefined, end: Date | null | undefined): string {
  if (!start || !end) return '00:00:00';
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  const ms = endMs - startMs;
  if (ms < 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return readarrError(400, 'Invalid id');
  const job = await getJob(Number(id));
  if (job === null) return readarrError(404, 'Command not found');
  return NextResponse.json({
    id: job.id,
    name: job.kind,
    status: mapJobStatusToReadarr(job.status),
    queued: toIso(job.scheduledFor),
    started: toIso(job.startedAt),
    ended: toIso(job.finishedAt),
    duration: durationBetween(job.startedAt, job.finishedAt),
    trigger: 'manual',
    message: job.error ?? '',
  });
}

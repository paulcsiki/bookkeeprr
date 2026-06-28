import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { scoringWeightsSetting, adultFilterSetting } from '@/server/db/settings/matcher';
import { createReplayRun, getInProgressReplayRun, listReplayRuns } from '@/server/db/replay-runs';
import { enqueueJob } from '@/server/db/jobs';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import { getSeries } from '@/server/db/series';

export const dynamic = 'force-dynamic';

const PostBody = z.object({
  windowDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.null()]),
  seriesId: z.number().int().positive().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  if (parsed.data.seriesId !== undefined) {
    const found = await getSeries(parsed.data.seriesId);
    if (!found) {
      return NextResponse.json({ error: 'series-not-found' }, { status: 404 });
    }
  }

  const inProgress = await getInProgressReplayRun();
  if (inProgress) {
    return NextResponse.json({ error: 'run-in-progress', runId: inProgress.id }, { status: 409 });
  }

  const weights = await scoringWeightsSetting.get();
  const adultFilter = await adultFilterSetting.get();
  const run = await createReplayRun({
    windowDays: parsed.data.windowDays,
    weightsSnapshot: weights,
    adultFilterSnapshot: adultFilter,
    seriesId: parsed.data.seriesId ?? null,
  });

  await enqueueJob('release_match_replay', { replayRunId: run.id });

  const auditMetadata: Record<string, unknown> = { windowDays: parsed.data.windowDays };
  if (parsed.data.seriesId !== undefined) {
    auditMetadata.seriesId = parsed.data.seriesId;
  }
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'release_match_replay.enqueued',
    target: { kind: 'replay_run', id: String(run.id) },
    metadata: auditMetadata,
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ runId: run.id });
}

const GetQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const url = new URL(req.url);
  const parsed = GetQuery.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query' }, { status: 422 });
  }
  const runs = await listReplayRuns(parsed.data.limit);
  return NextResponse.json({ runs });
}

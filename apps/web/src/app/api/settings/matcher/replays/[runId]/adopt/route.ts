import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { getReplayRun } from '@/server/db/replay-runs';
import { getReplayDiff, markReplayDiffAdopted } from '@/server/db/release-match-replays';
import { grabRelease } from '@/server/grabber';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

const Body = z.object({
  replayIds: z.array(z.number().int().positive()).min(1).max(500),
});

type Ctx = { params: Promise<{ runId: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if ('status' in auth) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }
  const { runId: runIdRaw } = await ctx.params;
  const runId = Number(runIdRaw);
  if (!Number.isInteger(runId) || runId <= 0) {
    return NextResponse.json({ error: 'bad runId' }, { status: 400 });
  }
  const run = await getReplayRun(runId);
  if (!run) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  if (run.status !== 'completed') {
    return NextResponse.json({ error: 'run-not-completed' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const failed: Array<{ replayId: number; error: string }> = [];
  let adopted = 0;

  for (const replayId of parsed.data.replayIds) {
    const diff = await getReplayDiff(replayId);
    if (!diff || diff.replayRunId !== runId) {
      failed.push({ replayId, error: 'not-found' });
      continue;
    }
    if (diff.changedKind !== 'flipped' || !diff.newWouldGrab) {
      failed.push({ replayId, error: 'not-adoptable' });
      continue;
    }
    if (diff.adoptedAt) {
      // Best-effort de-dup against rapid re-clicks of the same button.
      // Two truly-concurrent POSTs could both see null here and double-grab;
      // single-user app makes that a non-concern in practice.
      adopted += 1;
      continue;
    }

    const result = await grabRelease(diff.releaseId);
    if (!result.ok) {
      failed.push({ replayId, error: `${result.error.code}: ${result.error.message}` });
      continue;
    }
    await markReplayDiffAdopted(replayId);
    adopted += 1;

    await recordAuditEvent({
      actor: { kind: 'user', userId: auth.user.id, username: auth.user.username },
      action: 'release_match_replay.adopted',
      target: { kind: 'replay_decision', id: String(replayId) },
      metadata: { releaseId: diff.releaseId, downloadId: result.result.downloadId },
      context: {
        peerIp: extractProxyIp(req),
        clientIp: extractClientIp(req),
        userAgent: req.headers.get('user-agent'),
      },
    });
  }

  return NextResponse.json({ adopted, failed });
}

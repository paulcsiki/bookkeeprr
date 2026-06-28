import { NextResponse } from 'next/server';
import { MatcherWeightsPatchBody } from '@/server/openapi/schemas/settings';
import { requireAdmin } from '@/server/auth/require-admin';
import { scoringWeightsSetting, type ScoringWeights } from '@/server/db/settings/matcher';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import { maybeAutoEnqueueReplay } from '@/server/auto-grab/maybe-auto-replay';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request): Promise<NextResponse> {
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
  const parsed = MatcherWeightsPatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const current = await scoringWeightsSetting.get();
  const merged: ScoringWeights = { ...current, ...parsed.data };
  await scoringWeightsSetting.set(merged);

  const changedFields = shallowDiff(
    current as unknown as Record<string, unknown>,
    merged as unknown as Record<string, unknown>,
  );

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'matcher-weights' },
    metadata: { changedFields },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  const autoReplay = await maybeAutoEnqueueReplay(req, ctx.user, changedFields);
  const responsePayload: {
    config: ScoringWeights;
    autoReplayEnqueued?: { runId: number } | { error: string };
  } = { config: merged };
  if (autoReplay) responsePayload.autoReplayEnqueued = autoReplay;
  return NextResponse.json(responsePayload);
}

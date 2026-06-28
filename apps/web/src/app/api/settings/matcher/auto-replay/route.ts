import { NextResponse } from 'next/server';
import { MatcherAutoReplayPatchBody } from '@/server/openapi/schemas/settings';
import { requireAdmin } from '@/server/auth/require-admin';
import { matcherAutoReplaySetting } from '@/server/db/settings/matcher';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

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
  const parsed = MatcherAutoReplayPatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const prev = await matcherAutoReplaySetting.get();
  await matcherAutoReplaySetting.set(parsed.data.enabled);

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'matcher-auto-replay' },
    metadata: { from: prev, to: parsed.data.enabled },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ enabled: parsed.data.enabled });
}

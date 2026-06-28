import { NextResponse } from 'next/server';
import { AutoGrabPatchBody } from '@/server/openapi/schemas/settings';
import { requireAdmin } from '@/server/auth/require-admin';
import { autoGrabSetting, type AutoGrabConfig } from '@/server/db/settings/auto-grab';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const cfg = await autoGrabSetting.get();
  return NextResponse.json(cfg);
}

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
  const parsed = AutoGrabPatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const current = await autoGrabSetting.get();
  const merged: AutoGrabConfig = { ...current, ...parsed.data };
  await autoGrabSetting.set(merged);

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'auto-grab' },
    metadata: {
      changedFields: shallowDiff(
        current as unknown as Record<string, unknown>,
        merged as unknown as Record<string, unknown>,
      ),
    },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ config: merged });
}

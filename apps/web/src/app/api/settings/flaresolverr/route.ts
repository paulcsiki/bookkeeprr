import { NextResponse } from 'next/server';
import { flaresolverrSetting, FlaresolverrSchema } from '@/server/db/settings/flaresolverr';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export async function GET(): Promise<Response> {
  const v = await flaresolverrSetting.get();
  return NextResponse.json({ url: v.url });
}

export async function PUT(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = FlaresolverrSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const before = await flaresolverrSetting.get();
  await flaresolverrSetting.set(parsed.data);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'flaresolverr' },
    metadata: {
      changedFields: shallowDiff(
        before as unknown as Record<string, unknown>,
        parsed.data as unknown as Record<string, unknown>,
      ),
    },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });
  return NextResponse.json({ ok: true });
}

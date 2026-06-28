import { NextResponse } from 'next/server';
import { qbtConnectionSetting, QbtConnectionSchema } from '@/server/db/settings/qbt';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export async function GET(): Promise<Response> {
  const v = await qbtConnectionSetting.get();
  return NextResponse.json({
    host: v.host,
    port: v.port,
    username: v.username,
    password: v.password.length > 0 ? '****' : '',
    useHttps: v.useHttps,
  });
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
  const parsed = QbtConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const before = await qbtConnectionSetting.get();
  // Retain existing password if submitted blank.
  if (parsed.data.password === '') {
    parsed.data.password = before.password;
  }
  await qbtConnectionSetting.set(parsed.data);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'qbt' },
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

import { NextResponse } from 'next/server';
import { MalPutBody } from '@/server/openapi/schemas/settings';
import { malClientIdSetting } from '@/server/db/settings/mal';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export async function GET(): Promise<Response> {
  const clientId = await malClientIdSetting.get();
  return NextResponse.json({ clientId: clientId.length > 0 ? '****' : '' });
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
  const parsed = MalPutBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const before = await malClientIdSetting.get();
  // Mirror the qBittorrent/ComicVine "leave blank to keep" behavior: a blank
  // (or masked) submission retains the stored Client ID.
  if ((parsed.data.clientId === '' || parsed.data.clientId === '****') && before.length > 0) {
    return NextResponse.json({ ok: true });
  }
  await malClientIdSetting.set(parsed.data.clientId);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.mal.update',
    target: { kind: 'settings', id: 'mal' },
    metadata: {
      changedFields: shallowDiff(
        { clientId: before } as Record<string, unknown>,
        { clientId: parsed.data.clientId } as Record<string, unknown>,
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

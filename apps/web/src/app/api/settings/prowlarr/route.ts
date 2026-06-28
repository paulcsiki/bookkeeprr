import { NextResponse } from 'next/server';
import { ProwlarrSettingsPutBody } from '@/server/openapi/schemas/settings';
import { prowlarrConnectionSetting } from '@/server/db/settings/prowlarr';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export async function GET(): Promise<Response> {
  const stored = await prowlarrConnectionSetting.get();
  return NextResponse.json({ url: stored.url, apiKey: stored.apiKey.length > 0 ? '****' : '' });
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
  const parsed = ProwlarrSettingsPutBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const before = await prowlarrConnectionSetting.get();
  // Blank or masked apiKey keeps the stored secret; url is always applied.
  const keepKey = parsed.data.apiKey === '' || parsed.data.apiKey === '****';
  const next = {
    url: parsed.data.url,
    apiKey: keepKey ? before.apiKey : parsed.data.apiKey,
  };
  await prowlarrConnectionSetting.set(next);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'prowlarr' },
    metadata: {
      changedFields: shallowDiff(
        before as unknown as Record<string, unknown>,
        next as unknown as Record<string, unknown>,
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

import { NextResponse } from 'next/server';
import { ComicVinePutBody } from '@/server/openapi/schemas/settings';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export async function GET(): Promise<Response> {
  const apiKey = await comicVineApiKeySetting.get();
  return NextResponse.json({ apiKey: apiKey.length > 0 ? '****' : '' });
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
  const parsed = ComicVinePutBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const before = await comicVineApiKeySetting.get();
  if (parsed.data.apiKey === '' && before.length > 0) {
    return NextResponse.json({ ok: true });
  }
  await comicVineApiKeySetting.set(parsed.data.apiKey);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'comicvine' },
    metadata: {
      changedFields: shallowDiff(
        { apiKey: before } as Record<string, unknown>,
        { apiKey: parsed.data.apiKey } as Record<string, unknown>,
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

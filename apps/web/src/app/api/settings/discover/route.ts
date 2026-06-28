import { NextResponse } from 'next/server';
import { DiscoverPutBody } from '@/server/openapi/schemas/settings';
import { discoverTrendingSourceSetting } from '@/server/db/settings/discover';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export async function GET(): Promise<Response> {
  const trendingSource = await discoverTrendingSourceSetting.get();
  return NextResponse.json({ trendingSource });
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
  const parsed = DiscoverPutBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const before = await discoverTrendingSourceSetting.get();
  await discoverTrendingSourceSetting.set(parsed.data.trendingSource);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.discover.update',
    target: { kind: 'settings', id: 'discover' },
    metadata: {
      changedFields: shallowDiff(
        { trendingSource: before } as Record<string, unknown>,
        { trendingSource: parsed.data.trendingSource } as Record<string, unknown>,
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

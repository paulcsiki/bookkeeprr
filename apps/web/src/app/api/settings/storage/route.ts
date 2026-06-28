import { NextResponse } from 'next/server';
import { StoragePutBody } from '@/server/openapi/schemas/settings';
import {
  contentTypePathsSetting,
  torrentCleanupSetting,
  imageCacheSetting,
} from '@/server/db/settings/library';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  const [contentTypePaths, torrentCleanup, imageCache] = await Promise.all([
    contentTypePathsSetting.get(),
    torrentCleanupSetting.get(),
    imageCacheSetting.get(),
  ]);
  return NextResponse.json({ contentTypePaths, torrentCleanup, imageCache });
}

export async function PUT(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = StoragePutBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }

  await Promise.all([
    contentTypePathsSetting.set(parsed.data.contentTypePaths),
    torrentCleanupSetting.set(parsed.data.torrentCleanup),
    ...(parsed.data.imageCache ? [imageCacheSetting.set(parsed.data.imageCache)] : []),
  ]);

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'storage' },
    metadata: {
      contentTypePaths: parsed.data.contentTypePaths,
      torrentCleanup: parsed.data.torrentCleanup,
      ...(parsed.data.imageCache ? { imageCache: parsed.data.imageCache } : {}),
    },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ ok: true });
}

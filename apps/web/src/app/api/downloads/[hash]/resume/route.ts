import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { resumeTorrent, QbittorrentError } from '@/server/integrations/qbittorrent/client';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ hash: string }> },
): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const { hash } = await params;
  const conn = await qbtConnectionSetting.get();
  if (!isQbtConfigured(conn)) {
    return NextResponse.json({ message: 'qBittorrent not configured' }, { status: 502 });
  }

  try {
    await resumeTorrent(conn, hash);
    await recordAuditEvent({
      actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
      action: 'download.resume',
      target: { kind: 'download', id: hash },
      context: auditContext(req),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof QbittorrentError ? err.message : 'qBittorrent error';
    return NextResponse.json({ message }, { status: 502 });
  }
}

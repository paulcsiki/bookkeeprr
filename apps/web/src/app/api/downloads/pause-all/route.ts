import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { pauseTorrentsByCategory, QbittorrentError } from '@/server/integrations/qbittorrent/client';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const conn = await qbtConnectionSetting.get();
  if (!isQbtConfigured(conn)) {
    return NextResponse.json({ message: 'qBittorrent not configured' }, { status: 502 });
  }

  try {
    await pauseTorrentsByCategory(conn, 'bookkeeprr');
    await recordAuditEvent({
      actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
      action: 'download.pause_all',
      context: auditContext(req),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof QbittorrentError ? err.message : 'qBittorrent error';
    return NextResponse.json({ message }, { status: 502 });
  }
}

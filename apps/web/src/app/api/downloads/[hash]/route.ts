import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { deleteTorrent, QbittorrentError } from '@/server/integrations/qbittorrent/client';
import { getDownloadByQbtHash, deleteDownload } from '@/server/db/downloads';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';
import { logger } from '@/server/logger';

export const dynamic = 'force-dynamic';

/**
 * Cancel a download: remove it from qBittorrent (with its files) AND delete our
 * download row so it leaves the activity feed. Both steps are best-effort and
 * idempotent — a torrent already gone from qBit, or a row already removed, must
 * not block the other step, otherwise "Cancel" appears to do nothing.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ hash: string }> },
): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const log = logger().child({ component: 'api.downloads.delete' });

  const { hash } = await params;
  const conn = await qbtConnectionSetting.get();

  // Remove from qBittorrent (with files). Best-effort: if it's already gone, log
  // and continue so we still clear our row.
  if (isQbtConfigured(conn)) {
    try {
      await deleteTorrent(conn, hash, { deleteFiles: true });
    } catch (err) {
      const message = err instanceof QbittorrentError ? err.message : (err as Error).message;
      log.warn({ err: message, hash }, 'qbt delete failed; clearing the download row anyway');
    }
  }

  // Clear our row so the item disappears from the activity feed.
  const row = await getDownloadByQbtHash(hash);
  if (row) await deleteDownload(row.id);

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'download.delete',
    target: { kind: 'download', id: hash },
    context: auditContext(req),
  });
  return NextResponse.json({ ok: true });
}

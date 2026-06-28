import { NextResponse } from 'next/server';
import { grabRelease } from '@/server/grabber';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';
import { mapGrabErrorToHttp } from '@/app/api/_grab-helpers';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const releaseId = Number(id);
  const result = await grabRelease(releaseId);
  if (result.ok) {
    const actor = await auditActor(req);
    await recordAuditEvent({
      actor,
      action: 'release.grab',
      target: { kind: 'release', id: String(releaseId) },
      context: auditContext(req),
    });
    return NextResponse.json(
      { downloadId: result.result.downloadId, qbtHash: result.result.qbtHash, status: 'queued' },
      { status: 201 },
    );
  }
  return mapGrabErrorToHttp(result.error);
}

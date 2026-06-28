import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { getQualityProfile, setDefaultQualityProfile } from '@/server/db/quality-profiles';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
  }

  const existing = await getQualityProfile(id);
  if (!existing) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  await setDefaultQualityProfile(id);
  const updated = await getQualityProfile(id);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'quality_profile.set_default',
    target: { kind: 'quality_profile', id: String(id) },
    context: auditContext(req),
  });
  return NextResponse.json(updated);
}

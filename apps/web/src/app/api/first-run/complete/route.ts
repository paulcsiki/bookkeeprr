import { NextResponse } from 'next/server';
import { firstRunCompleteSetting } from '@/server/db/settings/first-run';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export async function POST(req: Request): Promise<Response> {
  await firstRunCompleteSetting.set(true);
  const actor = await auditActor(req);
  await recordAuditEvent({
    actor,
    action: 'first_run.complete',
    context: auditContext(req),
  });
  return NextResponse.json({ ok: true });
}

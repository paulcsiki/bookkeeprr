import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPath } from '@/server/first-run/paths';
import { mediaRootSetting } from '@/server/db/settings/library';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

const Body = z.object({ path: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ message: 'path required' }, { status: 400 });
  const status = checkPath(parsed.data.path);
  if (status !== 'writable') {
    return NextResponse.json({ status, message: 'Path is not writable' }, { status: 400 });
  }
  await mediaRootSetting.set(parsed.data.path);
  const actor = await auditActor(req);
  await recordAuditEvent({
    actor,
    action: 'first_run.media_root',
    metadata: { path: parsed.data.path },
    context: auditContext(req),
  });
  return NextResponse.json({ status: 'writable' });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MeProfilePatchBody as Body } from '@/server/openapi/schemas/auth';
import { getSessionByToken } from '@/server/db/sessions';
import { getUser, updateUser } from '@/server/db/users';
import { readSessionCookie } from '@/server/auth/session-cookie';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request): Promise<NextResponse> {
  const token = readSessionCookie(req);
  if (token === null) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const session = await getSessionByToken(token);
  if (session === null || session.expiresAt <= new Date()) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const user = await getUser(session.userId);
  if (user === null || user.disabled) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });

  const patch: { displayName?: string | null; email?: string | null } = {};
  if (parsed.data.displayName !== undefined) {
    patch.displayName = parsed.data.displayName.length > 0 ? parsed.data.displayName : null;
  }
  if (parsed.data.email !== undefined) {
    const e = parsed.data.email;
    if (e.length === 0) {
      patch.email = null;
    } else if (!z.string().email().safeParse(e).success) {
      return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 });
    } else {
      patch.email = e;
    }
  }
  await updateUser(user.id, patch);

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'profile.update',
    target: { kind: 'user', id: String(user.id) },
    metadata: { fields: Object.keys(parsed.data) },
    context: auditContext(req),
  });

  const fresh = await getUser(user.id);
  return NextResponse.json({
    user: { id: fresh!.id, username: fresh!.username, displayName: fresh!.displayName, email: fresh!.email, role: fresh!.role },
  });
}

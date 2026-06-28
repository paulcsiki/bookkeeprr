import { NextResponse } from 'next/server';
import { UserResetPasswordBody as Body } from '@/server/openapi/schemas/users';
import { getUser, updateUser } from '@/server/db/users';
import { revokeAllSessionsForUser } from '@/server/db/sessions';
import { hashPassword, validatePasswordPolicy } from '@/server/auth/password';
import { logPasswordChange } from '@/server/auth/events';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if ('status' in auth)
    return NextResponse.json({ message: auth.message }, { status: auth.status });

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
  }
  const target = await getUser(Number(id));
  if (target === null) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }
  const policy = validatePasswordPolicy(parsed.data.newPassword);
  if (!policy.ok) {
    return NextResponse.json({ message: policy.reason }, { status: 400 });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await updateUser(target.id, {
    passwordHash: newHash,
    mustChangePassword: parsed.data.mustChangePassword ?? true,
  });
  await revokeAllSessionsForUser(target.id);
  logPasswordChange({
    userId: target.id,
    username: target.username,
    byUserId: auth.user.id,
    byUsername: auth.user.username,
    forced: true,
  });
  await recordAuditEvent({
    actor: { kind: 'user', userId: auth.user.id, username: auth.user.username },
    action: 'user.reset_password',
    target: { kind: 'user', id: String(target.id) },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ ok: true });
}

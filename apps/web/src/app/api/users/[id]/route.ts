import { NextResponse } from 'next/server';
import { UserPatchBody as PatchBody } from '@/server/openapi/schemas/users';
import { countActiveAdmins, deleteUser, getUser, updateUser } from '@/server/db/users';
import { revokeAllSessionsForUser } from '@/server/db/sessions';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
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
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  // Last-admin guard for role demotion
  if (parsed.data.role === 'user' && target.role === 'admin') {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      return NextResponse.json({ message: 'Cannot demote the last admin' }, { status: 409 });
    }
  }

  // Self-disable guard
  if (parsed.data.disabled === true && target.id === auth.user.id) {
    return NextResponse.json({ message: 'Cannot disable your own account' }, { status: 409 });
  }

  // Last-admin guard for disable
  if (parsed.data.disabled === true && target.role === 'admin') {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      return NextResponse.json({ message: 'Cannot disable the last admin' }, { status: 409 });
    }
  }

  await updateUser(target.id, parsed.data);

  if (parsed.data.disabled === true) {
    await revokeAllSessionsForUser(target.id);
  }

  const after = await getUser(target.id);
  const changedFields = shallowDiff(
    (target ?? {}) as unknown as Record<string, unknown>,
    (after ?? {}) as unknown as Record<string, unknown>,
  );
  await recordAuditEvent({
    actor: { kind: 'user', userId: auth.user.id, username: auth.user.username },
    action: 'user.update',
    target: { kind: 'user', id: String(target.id) },
    metadata: { changedFields },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx): Promise<NextResponse> {
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

  if (target.id === auth.user.id) {
    return NextResponse.json({ message: 'Cannot delete your own account' }, { status: 409 });
  }

  if (target.role === 'admin') {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      return NextResponse.json({ message: 'Cannot delete the last admin' }, { status: 409 });
    }
  }

  await deleteUser(target.id);
  await recordAuditEvent({
    actor: { kind: 'user', userId: auth.user.id, username: auth.user.username },
    action: 'user.delete',
    target: { kind: 'user', id: String(target.id) },
    metadata: { deletedUsername: target.username },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });
  return new NextResponse(null, { status: 204 });
}

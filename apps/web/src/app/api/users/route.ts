import { NextResponse } from 'next/server';
import { UserCreateBody as PostBody } from '@/server/openapi/schemas/users';
import { insertUser, listUsers } from '@/server/db/users';
import { hashPassword, validatePasswordPolicy } from '@/server/auth/password';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import type { UserRow } from '@/server/db/schema';

export const dynamic = 'force-dynamic';

function publicUser(
  u: UserRow,
): Omit<UserRow, 'passwordHash' | 'totpSecretEncrypted' | 'totpRecoveryCodesHashed'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, totpSecretEncrypted, totpRecoveryCodesHashed, ...rest } = u;
  return rest;
}

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  const rows = await listUsers();
  // Expose the avatar as a URL (matching the SSR shape consumed by UsersList)
  // rather than the raw on-disk avatarPath.
  const users = rows.map((u) => {
    const { avatarPath, ...rest } = publicUser(u);
    return { ...rest, avatarUrl: avatarPath != null ? `/api/auth/me/avatar/${u.id}` : null };
  });
  return NextResponse.json({ users });
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = PostBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }
  const policy = validatePasswordPolicy(parsed.data.password);
  if (!policy.ok) {
    return NextResponse.json({ message: policy.reason }, { status: 400 });
  }
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await insertUser({
      username: parsed.data.username,
      passwordHash,
      role: parsed.data.role,
      mustChangePassword: parsed.data.mustChangePassword ?? true,
    });
    await recordAuditEvent({
      actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
      action: 'user.create',
      target: { kind: 'user', id: String(user.id) },
      metadata: { username: user.username, role: user.role },
      context: {
        peerIp: extractProxyIp(req),
        clientIp: extractClientIp(req),
        userAgent: req.headers.get('user-agent'),
      },
    });
    return NextResponse.json({ user: publicUser(user) }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ message: 'Username already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Failed to create user', detail: msg }, { status: 500 });
  }
}

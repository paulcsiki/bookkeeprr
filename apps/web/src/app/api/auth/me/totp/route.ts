import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { PasswordConfirmBody as DeleteBody } from '@/server/openapi/schemas/auth';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { verifyPassword } from '@/server/auth/password';
import { getUser, updateUser } from '@/server/db/users';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/auth/me/totp
 *
 * Auth required. Verifies the user's local password, then clears all
 * TOTP columns (disabling 2FA).
 *
 * Body: { password: string }
 * Returns: { ok: true }
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(req);
  if (auth.kind !== 'authenticated' || auth.actor === 'system') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const user = await getUser(auth.actor.userId);
  if (user === null || user.disabled) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // OIDC users have no password — disable is not supported.
  if (user.authSource !== 'local' || user.passwordHash === null) {
    return NextResponse.json(
      { message: 'Password verification is not available for this account type.' },
      { status: 400 },
    );
  }

  let body: z.infer<typeof DeleteBody>;
  try {
    body = DeleteBody.parse(await req.json());
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ message: 'Incorrect password.' }, { status: 401 });
  }

  await updateUser(user.id, {
    totpSecretEncrypted: null,
    totpEnabledAt: null,
    totpRecoveryCodesHashed: null,
  });

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'totp.disable',
    target: { kind: 'user', id: String(user.id) },
    context: auditContext(req),
  });

  return NextResponse.json({ ok: true });
}

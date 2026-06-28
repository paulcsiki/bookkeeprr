import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { PasswordConfirmBody as Body } from '@/server/openapi/schemas/auth';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { verifyPassword } from '@/server/auth/password';
import { generateRecoveryCodes, hashRecoveryCode } from '@/server/auth/totp';
import { getUser, updateUser } from '@/server/db/users';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/me/totp/recovery-codes/regenerate
 *
 * Auth required. Verifies the user's password, generates 10 fresh recovery
 * codes, persists the hashed versions, and returns the plaintext once.
 *
 * Body: { password: string }
 * Returns: { recoveryCodes: string[] }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(req);
  if (auth.kind !== 'authenticated' || auth.actor === 'system') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const user = await getUser(auth.actor.userId);
  if (user === null || user.disabled) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (user.authSource !== 'local' || user.passwordHash === null) {
    return NextResponse.json(
      { message: 'Password verification is not available for this account type.' },
      { status: 400 },
    );
  }

  // TOTP must be enabled to regenerate codes.
  if (user.totpEnabledAt === null) {
    return NextResponse.json(
      { message: 'Two-factor authentication is not enabled.' },
      { status: 400 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ message: 'Incorrect password.' }, { status: 401 });
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashed = recoveryCodes.map(hashRecoveryCode);

  await updateUser(user.id, {
    totpRecoveryCodesHashed: JSON.stringify(hashed),
  });

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'totp.recovery_codes_regenerate',
    target: { kind: 'user', id: String(user.id) },
    context: auditContext(req),
  });

  return NextResponse.json({ recoveryCodes });
}

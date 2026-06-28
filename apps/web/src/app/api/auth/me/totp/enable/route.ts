import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { TotpEnableBody as Body } from '@/server/openapi/schemas/auth';
import { authenticateRequest } from '@/server/auth/session-middleware';
import {
  verifyTotpCode,
  encryptSecret,
  hashRecoveryCode,
} from '@/server/auth/totp';
import { getUser, updateUser } from '@/server/db/users';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/me/totp/enable
 *
 * Auth required. Verifies the provided code against the provided secret,
 * then persists the encrypted secret + hashed recovery codes.
 *
 * Body: { secret: string, code: string, recoveryCodes: string[] }
 * Returns: { ok: true }
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
      { message: 'Two-factor authentication is only available for local accounts.' },
      { status: 400 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  const valid = verifyTotpCode(body.secret, body.code);
  if (!valid) {
    return NextResponse.json({ message: 'Invalid code. Please try again.' }, { status: 422 });
  }

  const encrypted = encryptSecret(body.secret);
  const hashedCodes = body.recoveryCodes.map(hashRecoveryCode);

  await updateUser(user.id, {
    totpSecretEncrypted: encrypted,
    totpEnabledAt: new Date(),
    totpRecoveryCodesHashed: JSON.stringify(hashedCodes),
  });

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'totp.enable',
    target: { kind: 'user', id: String(user.id) },
    context: auditContext(req),
  });

  return NextResponse.json({ ok: true });
}

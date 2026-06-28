import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { LoginTotpBody as Body } from '@/server/openapi/schemas/auth';
import { verifyChallengeToken } from '@/server/auth/totp-challenge';
import { verifyTotpCode, decryptSecret, verifyRecoveryCode } from '@/server/auth/totp';
import { getUser, updateUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { updateUser as updateLastLogin } from '@/server/db/users';
import { logLoginSuccess } from '@/server/auth/events';
import { setSessionCookie } from '@/server/auth/session-cookie';
import { createExchangeCode } from '@/server/mobile/exchange-codes';
import { validateReturnTo, appendExchangeCode } from '@/server/mobile/return-to';

export const dynamic = 'force-dynamic';

const RECOVERY_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/i;

/**
 * POST /api/auth/login/totp
 *
 * Completes the TOTP challenge step. Accepts either a 6-digit TOTP code or
 * a xxxx-xxxx-xxxx recovery code.
 *
 * On success, issues a session cookie.
 * Body: { challengeToken: string, code: string, return_to?: string }
 */
export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  const claim = await verifyChallengeToken(body.challengeToken);
  if (claim === null) {
    return NextResponse.json(
      { message: 'Challenge token expired or invalid. Please sign in again.' },
      { status: 401 },
    );
  }

  const user = await getUser(claim.userId);
  if (user === null || user.disabled || user.totpEnabledAt === null || user.totpSecretEncrypted === null) {
    return NextResponse.json({ message: 'Invalid state.' }, { status: 400 });
  }

  const secret = decryptSecret(user.totpSecretEncrypted);
  const code = body.code.trim().toUpperCase();
  const isRecovery = RECOVERY_CODE_PATTERN.test(code);

  if (isRecovery) {
    // Recovery code path
    const storedHashed: string[] = user.totpRecoveryCodesHashed
      ? (JSON.parse(user.totpRecoveryCodesHashed) as string[])
      : [];

    const result = verifyRecoveryCode(code, storedHashed);
    if (!result.matched) {
      return NextResponse.json({ message: 'Invalid recovery code.' }, { status: 401 });
    }
    // Consume the recovery code
    await updateUser(user.id, {
      totpRecoveryCodesHashed: JSON.stringify(result.remaining),
    });
  } else {
    // TOTP path
    const valid = verifyTotpCode(secret, body.code.trim());
    if (!valid) {
      return NextResponse.json({ message: 'Invalid code. Please try again.' }, { status: 401 });
    }
  }

  const ip = req.headers.get('x-forwarded-for') ?? null;
  const ua = req.headers.get('user-agent');

  const session = await createSession({ userId: user.id, userAgent: ua, ipAddress: ip });
  await updateLastLogin(user.id, { lastLoginAt: new Date() });
  logLoginSuccess({ userId: user.id, username: user.username, ipAddress: ip, userAgent: ua });

  // Handle mobile return_to (exchange code flow)
  let redirectTo: string | null = null;
  if (body.return_to !== undefined) {
    const validated = validateReturnTo(body.return_to);
    if (validated !== null) {
      const exchangeCode = await createExchangeCode(user.id);
      redirectTo = appendExchangeCode(validated, exchangeCode);
    }
  }

  const res = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    ...(redirectTo !== null ? { redirect_to: redirectTo } : {}),
  });
  setSessionCookie(res, session.token, req);
  return res;
}

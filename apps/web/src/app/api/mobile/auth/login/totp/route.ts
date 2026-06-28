import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyChallengeToken } from '@/server/auth/totp-challenge';
import { verifyTotpCode, decryptSecret, verifyRecoveryCode } from '@/server/auth/totp';
import { getUser, updateUser } from '@/server/db/users';
import { logLoginSuccess } from '@/server/auth/events';
import { issueMobileToken } from '@/server/mobile/tokens';

export const dynamic = 'force-dynamic';

const Body = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(1),
});

const RECOVERY_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/i;

/**
 * POST /api/mobile/auth/login/totp
 *
 * Mobile-specific TOTP challenge endpoint. On success, issues a mobile
 * bearer token instead of a session cookie.
 *
 * Body: { challengeToken: string, code: string }
 * Returns: { token: string, refreshToken: string, expiresAt: string }
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
  if (
    user === null ||
    user.disabled ||
    user.totpEnabledAt === null ||
    user.totpSecretEncrypted === null
  ) {
    return NextResponse.json({ message: 'Invalid state.' }, { status: 400 });
  }

  const secret = decryptSecret(user.totpSecretEncrypted);
  const code = body.code.trim().toUpperCase();
  const isRecovery = RECOVERY_CODE_PATTERN.test(code);

  if (isRecovery) {
    const storedHashed: string[] = user.totpRecoveryCodesHashed
      ? (JSON.parse(user.totpRecoveryCodesHashed) as string[])
      : [];

    const result = verifyRecoveryCode(code, storedHashed);
    if (!result.matched) {
      return NextResponse.json({ message: 'Invalid recovery code.' }, { status: 401 });
    }
    await updateUser(user.id, {
      totpRecoveryCodesHashed: JSON.stringify(result.remaining),
    });
  } else {
    const valid = verifyTotpCode(secret, body.code.trim());
    if (!valid) {
      return NextResponse.json({ message: 'Invalid code. Please try again.' }, { status: 401 });
    }
  }

  const ip = req.headers.get('x-forwarded-for') ?? null;
  const ua = req.headers.get('user-agent');
  logLoginSuccess({ userId: user.id, username: user.username, ipAddress: ip, userAgent: ua });

  const { token, refreshToken, expiresAt } = await issueMobileToken(user.id, { label: ua });

  return NextResponse.json({ token, refreshToken, expiresAt: expiresAt.toISOString() });
}

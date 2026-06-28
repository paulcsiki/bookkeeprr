import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { authenticateRequest } from '@/server/auth/session-middleware';
import {
  generateSecret,
  generateOtpauthUri,
  generateRecoveryCodes,
} from '@/server/auth/totp';
import { getUser } from '@/server/db/users';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/me/totp/setup
 *
 * Auth required. Generates a new TOTP secret + recovery codes but does NOT
 * persist anything yet — the user must verify a code first via /enable.
 *
 * Returns: { secret, otpauthUri, qrCodeDataUrl, recoveryCodes }
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

  // OIDC / forward-auth users have no local password — 2FA is not supported for them.
  if (user.authSource !== 'local' || user.passwordHash === null) {
    return NextResponse.json(
      { message: 'Two-factor authentication is only available for local accounts.' },
      { status: 400 },
    );
  }

  const secret = generateSecret();
  const otpauthUri = generateOtpauthUri(secret, user.username);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 2 });
  const recoveryCodes = generateRecoveryCodes();

  return NextResponse.json({ secret, otpauthUri, qrCodeDataUrl, recoveryCodes });
}

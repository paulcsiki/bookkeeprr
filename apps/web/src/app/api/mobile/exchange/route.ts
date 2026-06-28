import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeExchangeCode, pruneExpiredExchangeCodes } from '@/server/mobile/exchange-codes';
import {
  e2eBypassCode,
  isE2eLoginBypassEnabled,
  resolveE2eBypassUserId,
} from '@/server/mobile/e2e-login-bypass';
import { issueMobileToken } from '@/server/mobile/tokens';
import { getUser } from '@/server/db/users';

export const dynamic = 'force-dynamic';

const Body = z.object({
  exchange_code: z.string().min(1),
});

/**
 * POST /api/mobile/exchange — public, but gated by the one-time exchange
 * code itself. Trades an exchange code for a fresh mobile bearer + refresh
 * token pair.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // E2E login bypass (env-gated, off in production): real-server mobile
  // Maestro flows can't drive the browser handoff, so they post a fixed code
  // that resolves to a seeded user. Falls through to the normal path for any
  // other code, so the gate never weakens real exchange-code validation.
  let userId: number | null;
  if (isE2eLoginBypassEnabled() && parsed.data.exchange_code === e2eBypassCode()) {
    userId = await resolveE2eBypassUserId();
  } else {
    // Opportunistic GC; cheap relative to the round-trip cost and keeps the
    // table from growing unbounded under bot scanning.
    await pruneExpiredExchangeCodes();
    userId = await consumeExchangeCode(parsed.data.exchange_code);
  }

  if (userId === null) {
    return NextResponse.json({ error: 'invalid_or_expired_code' }, { status: 401 });
  }
  // Refuse to issue a token for a disabled / deleted user.
  const user = await getUser(userId);
  if (user === null || user.disabled) {
    return NextResponse.json({ error: 'invalid_or_expired_code' }, { status: 401 });
  }

  const issued = await issueMobileToken(userId);
  return NextResponse.json({
    token: issued.token,
    refresh_token: issued.refreshToken,
    expires_at: issued.expiresAt.toISOString(),
  });
}

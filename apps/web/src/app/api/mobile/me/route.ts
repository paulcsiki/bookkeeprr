import { NextResponse } from 'next/server';
import { authenticateBearer } from '@/server/mobile/bearer-middleware';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/me — the current user's identity for a mobile (bearer-token)
 * client. The cookie-based /api/auth/me ignores bearer auth, so mobile had no
 * way to learn the real display name / email and fell back to a synthetic
 * identity derived from the server URL. This resolves the bearer token to the
 * owning user and returns the fields the app needs for the account header
 * (display name + email for the Gravatar lookup).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authenticateBearer(req);
  if (auth.kind !== 'authenticated') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const u = auth.user;
  return NextResponse.json({
    id: u.id,
    username: u.username,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    role: u.role,
    // Mirror /api/users + dashboard-agg's avatarUrlFor: expose the per-user
    // avatar route when an avatar is set, else null.
    avatarUrl: u.avatarPath != null ? `/api/auth/me/avatar/${u.id}` : null,
  });
}

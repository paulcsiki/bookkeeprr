import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateBearer } from '@/server/mobile/bearer-middleware';
import { getUser, updateUser } from '@/server/db/users';

export const dynamic = 'force-dynamic';

const Body = z.object({
  version: z.string().min(1),
});

/**
 * GET /api/mobile/changelog-seen — bearer-only. Returns the user's
 * last-seen changelog version so the mobile dialog can decide whether
 * to show.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authenticateBearer(req);
  if (auth.kind !== 'authenticated') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const user = await getUser(auth.user.id);
  return NextResponse.json({ version: user?.lastSeenChangelogVersion ?? null });
}

/**
 * POST /api/mobile/changelog-seen — bearer-only. Persists the supplied
 * version string on the user row so the mobile changelog dialog can
 * stop nagging.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authenticateBearer(req);
  if (auth.kind !== 'authenticated') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

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

  await updateUser(auth.user.id, { lastSeenChangelogVersion: parsed.data.version });
  return NextResponse.json({ version: parsed.data.version });
}

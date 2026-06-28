import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { updatesStateSetting } from '@/server/db/settings/updates';
import { updatesCheckDescriptor } from '@/server/jobs/kinds/updates-check';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_MS = 60_000;

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const state = await updatesStateSetting.get();
  if (state.fetchedAt) {
    const sinceMs = Date.now() - Date.parse(state.fetchedAt);
    if (sinceMs < RATE_LIMIT_MS) {
      return NextResponse.json(
        {
          error: 'rate-limited',
          retryAfterSeconds: Math.ceil((RATE_LIMIT_MS - sinceMs) / 1000),
        },
        { status: 429 },
      );
    }
  }
  await updatesCheckDescriptor.handler({}, 0);
  const after = await updatesStateSetting.get();
  return NextResponse.json({ state: after });
}

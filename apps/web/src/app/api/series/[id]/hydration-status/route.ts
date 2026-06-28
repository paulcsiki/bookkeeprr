import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { activeJobKindsForSeries } from '@/server/db/jobs';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function toId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * GET /api/series/[id]/hydration-status — `{ running, kinds, hydrating }`.
 *
 * `kinds` is the distinct set of pending/running background-job kinds for this
 * series (hydrate / chapter sync / volume hydrate / import); `running` is true
 * when that set is non-empty. `hydrating` is kept as a back-compat alias of
 * `running`. Session-gated like the other series read routes; the series-page
 * activity indicator polls this and refreshes the page when it flips idle.
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const seriesId = toId(id);
  if (seriesId === null) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const kinds = await activeJobKindsForSeries(seriesId);
  const running = kinds.length > 0;
  return NextResponse.json({ running, kinds, hydrating: running }, { status: 200 });
}

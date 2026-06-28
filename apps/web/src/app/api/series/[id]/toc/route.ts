import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { getSeries } from '@/server/db/series';
import { buildSeriesToc } from '@/server/reader/toc';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function toId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * GET /api/series/[id]/toc — the book's table of contents for the series'
 * present readable file.
 *
 * Session-gated, consistent with the reader manifest route. Resolves the
 * series' present epub/pdf file and returns its TOC as `{ entries: { title,
 * loc }[] }` (loc = a reader deep-link token). cbz/cbr/audio or no present
 * readable file → `{ entries: [] }`.
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const seriesId = toId(id);
  if (seriesId === null) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const series = await getSeries(seriesId);
  if (series === null) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const toc = await buildSeriesToc(seriesId, userId);
  return NextResponse.json(toc, { status: 200 });
}

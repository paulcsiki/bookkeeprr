import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/require-admin';
import { getReplayRun } from '@/server/db/replay-runs';
import { listReplayDiffs } from '@/server/db/release-match-replays';
import { getDb } from '@/server/db/client';
import { releases, series } from '@/server/db/schema';

export const dynamic = 'force-dynamic';

const Query = z.object({
  kind: z.enum(['flipped', 'rescored']).optional(),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

type Ctx = { params: Promise<{ runId: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if ('status' in auth) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }
  const { runId: runIdRaw } = await ctx.params;
  const runId = Number(runIdRaw);
  if (!Number.isInteger(runId) || runId <= 0) {
    return NextResponse.json({ error: 'bad runId' }, { status: 400 });
  }
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    kind: url.searchParams.get('kind') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query' }, { status: 422 });
  }

  const run = await getReplayRun(runId);
  if (!run) return NextResponse.json({ error: 'not-found' }, { status: 404 });

  const { rows, total } = await listReplayDiffs(runId, parsed.data);

  // Hydrate with release title + series id/title for table rendering.
  const releaseIds = rows.map((r) => r.releaseId);
  const releaseRows =
    releaseIds.length === 0
      ? []
      : await getDb()
          .select({
            id: releases.id,
            title: releases.title,
            seriesId: releases.seriesId,
            seriesTitleEnglish: series.titleEnglish,
            seriesTitleRomaji: series.titleRomaji,
            seriesTitleNative: series.titleNative,
          })
          .from(releases)
          .leftJoin(series, eq(series.id, releases.seriesId))
          .where(inArray(releases.id, releaseIds));
  const byId = new Map(
    releaseRows.map((r) => [
      r.id,
      {
        id: r.id,
        title: r.title,
        seriesId: r.seriesId,
        seriesTitle:
          r.seriesId === null
            ? null
            : (r.seriesTitleEnglish ??
              r.seriesTitleRomaji ??
              r.seriesTitleNative ??
              `Series #${r.seriesId}`),
      },
    ]),
  );
  const hydrated = rows.map((r) => ({
    ...r,
    release: byId.get(r.releaseId) ?? null,
  }));

  return NextResponse.json({ run, rows: hydrated, total });
}

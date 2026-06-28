import { NextResponse } from 'next/server';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { scanMatches } from '@/server/db/schema';
import { getManga } from '@/server/integrations/anilist/client';
import { getSeriesByAniListId } from '@/server/db/series';
import { dirHash } from '@/lib/dir-hash';
import { withWriteLock } from '@/server/db/write-lock';
import { ScanGroupMatchBody } from '@/server/openapi/schemas/scan';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ dirHash: string }> };

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { dirHash: targetHash } = await ctx.params;

  let parsed;
  try {
    parsed = ScanGroupMatchBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid payload', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const pending = await getDb().select().from(scanMatches).where(eq(scanMatches.status, 'pending'));
  const groupRows = pending.filter((r) => dirHash(dirname(r.filePath)) === targetHash);
  if (groupRows.length === 0) {
    return NextResponse.json({ error: 'group not found' }, { status: 404 });
  }

  let detail;
  try {
    detail = await getManga(parsed.anilistId);
  } catch (err) {
    return NextResponse.json(
      { error: 'anilist lookup failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const aniListMatch = {
    anilistId: detail.anilistId,
    titleRomaji: detail.titleRomaji,
    titleEnglish: detail.titleEnglish,
    titleNative: detail.titleNative,
    coverUrl: detail.coverUrl,
    status: detail.status,
    format: detail.format,
    startYear: detail.startYear,
  };
  const existing = await getSeriesByAniListId(detail.anilistId);

  await withWriteLock(() =>
    getDb().transaction((tx) => {
      for (const r of groupRows) {
        let prevStash: Record<string, unknown> = {};
        try {
          prevStash = JSON.parse(r.parserDebugJson) as Record<string, unknown>;
        } catch {
          // leave prevStash as the initial {}
        }
        const newDebug = JSON.stringify({ ...prevStash, aniListMatch });
        tx.update(scanMatches)
          .set({
            parserDebugJson: newDebug,
            proposedSeriesId: existing?.id ?? null,
          })
          .where(eq(scanMatches.id, r.id))
          .run();
      }
    }),
  );

  const actor = await auditActor(req);
  await recordAuditEvent({
    actor,
    action: 'scan.group_match',
    target: { kind: 'scan_group', id: targetHash },
    metadata: { anilistId: parsed.anilistId, updated: groupRows.length },
    context: auditContext(req),
  });

  return NextResponse.json({ ok: true, updated: groupRows.length }, { status: 200 });
}

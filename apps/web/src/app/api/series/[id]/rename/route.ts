import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { getSeries } from '@/server/db/series';
import { computeRenamePlan, applyRenamePlan } from '@/server/importer/rename';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function gate(
  req: Request,
  ctx: Ctx,
): Promise<{ seriesId: number } | NextResponse> {
  const admin = await requireAdmin(req);
  if ('status' in admin) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const seriesId = Number(id);
  if (!Number.isInteger(seriesId) || seriesId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const series = await getSeries(seriesId);
  if (!series) {
    return NextResponse.json({ error: 'series-not-found' }, { status: 404 });
  }
  return { seriesId };
}

/** Preview the rename plan (current → proposed paths) for a series. */
export async function GET(req: Request, ctx: Ctx): Promise<NextResponse> {
  const gated = await gate(req, ctx);
  if (gated instanceof NextResponse) return gated;
  const plan = await computeRenamePlan(gated.seriesId);
  return NextResponse.json(plan);
}

/** Apply the rename plan: rename files + folder on disk and update paths. */
export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const gated = await gate(req, ctx);
  if (gated instanceof NextResponse) return gated;
  const result = await applyRenamePlan(gated.seriesId);
  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'series.rename',
    target: { kind: 'series', id: String(gated.seriesId) },
    metadata: { renamed: result.renamed, errors: result.errors.length },
    context: auditContext(req),
  });
  return NextResponse.json(result);
}

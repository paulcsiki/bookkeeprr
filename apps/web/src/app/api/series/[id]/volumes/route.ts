import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { getSeries } from '@/server/db/series';
import { insertVolume, listVolumesBySeries } from '@/server/db/volumes';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    from: z.number().int().min(1).max(10_000),
    to: z.number().int().min(1).max(10_000),
  })
  .refine((b) => b.from <= b.to, { message: 'from must be <= to' })
  .refine((b) => b.to - b.from < 1000, { message: 'range too large (max 999 volumes per call)' });

type Ctx = { params: Promise<{ id: string }> };

async function resolveId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const series = await getSeries(id);
  if (!series) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const rows = await listVolumesBySeries(id);
  return NextResponse.json({
    volumes: rows.map((v) => ({ id: v.id, number: v.number, title: v.title })),
  });
}

/**
 * POST /api/series/[id]/volumes — admin-only.
 *
 * Bulk-create volume rows for a series, idempotently. Useful when the series
 * has no metadata source that auto-populates volumes (Open Library editions,
 * Audnex, manually-curated entries) AND for e2e tests that need to import a
 * release before metadata hydration runs.
 *
 * Body: { from: number, to: number } — inclusive range, max 999 per call.
 * Existing volume numbers are skipped without erroring.
 */
export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if ('status' in auth) return NextResponse.json({ message: auth.message }, { status: auth.status });

  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const series = await getSeries(id);
  if (!series) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const existing = new Set((await listVolumesBySeries(id)).map((v) => v.number));
  const created: number[] = [];
  for (let n = parsed.data.from; n <= parsed.data.to; n++) {
    if (existing.has(n)) continue;
    const vid = await insertVolume({ seriesId: id, number: n });
    created.push(vid);
  }
  await recordAuditEvent({
    actor: { kind: 'user', userId: auth.user.id, username: auth.user.username },
    action: 'series.volumes_update',
    target: { kind: 'series', id: String(id) },
    metadata: { from: parsed.data.from, to: parsed.data.to, created: created.length },
    context: auditContext(req),
  });
  return NextResponse.json({ created: created.length, ids: created }, { status: 201 });
}

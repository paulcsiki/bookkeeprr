import { NextResponse } from 'next/server';
import { getSeries, deleteSeries, updateSeries } from '@/server/db/series';
import { listVolumesBySeries } from '@/server/db/volumes';
import { seriesToReadarrAuthor } from '@/server/readarr/mappers';
import { ReadarrAuthorPutBody } from '@/server/readarr/schemas';
import { readarrError } from '@/server/readarr/auth';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return readarrError(400, 'Invalid id');
  const series = await getSeries(Number(id));
  if (series === null) return readarrError(404, 'Author not found');
  const volumes = await listVolumesBySeries(series.id);
  return NextResponse.json(seriesToReadarrAuthor(series, volumes));
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return readarrError(400, 'Invalid id');
  const series = await getSeries(Number(id));
  if (series === null) return readarrError(404, 'Author not found');
  await deleteSeries(series.id);
  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'readarr.author_delete',
    target: { kind: 'author', id: String(series.id) },
    metadata: { title: series.titleEnglish },
    context: auditContext(req),
  });
  return new Response(null, { status: 204 });
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return readarrError(400, 'Invalid id');
  const series = await getSeries(Number(id));
  if (series === null) return readarrError(404, 'Author not found');
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return readarrError(400, 'Invalid JSON body');
  }
  const parsed = ReadarrAuthorPutBody.safeParse(raw);
  if (!parsed.success) return readarrError(400, 'Invalid body', parsed.error.message);

  const patch: Parameters<typeof updateSeries>[1] = {};
  if (parsed.data.rootFolderPath !== undefined) {
    (patch as Record<string, unknown>).rootPath = parsed.data.rootFolderPath;
  }
  if (parsed.data.monitored !== undefined) {
    (patch as Record<string, unknown>).monitoring = parsed.data.monitored ? 'all' : 'none';
  }
  if (parsed.data.qualityProfileId !== undefined) {
    (patch as Record<string, unknown>).qualityProfileId = parsed.data.qualityProfileId;
  }

  if (Object.keys(patch).length > 0) {
    await updateSeries(series.id, patch);
  }

  const updated = await getSeries(series.id);
  if (updated === null) return readarrError(500, 'Series not retrievable after update');
  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'readarr.author_update',
    target: { kind: 'author', id: String(series.id) },
    metadata: { title: updated.titleEnglish },
    context: auditContext(req),
  });
  const volumes = await listVolumesBySeries(series.id);
  return NextResponse.json(seriesToReadarrAuthor(updated, volumes));
}

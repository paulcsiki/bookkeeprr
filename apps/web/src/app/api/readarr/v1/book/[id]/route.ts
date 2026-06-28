import { NextResponse } from 'next/server';
import { getSeries } from '@/server/db/series';
import { getVolume, deleteVolume, updateVolume } from '@/server/db/volumes';
import { volumeToReadarrBook } from '@/server/readarr/mappers';
import { ReadarrBookPutBody } from '@/server/readarr/schemas';
import { readarrError } from '@/server/readarr/auth';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return readarrError(400, 'Invalid id');
  const volume = await getVolume(Number(id));
  if (volume === null) return readarrError(404, 'Book not found');
  const series = await getSeries(volume.seriesId);
  if (series === null) return readarrError(404, 'Book not found');
  return NextResponse.json(volumeToReadarrBook(volume, series));
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return readarrError(400, 'Invalid id');
  const volume = await getVolume(Number(id));
  if (volume === null) return readarrError(404, 'Book not found');
  await deleteVolume(volume.id);
  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'readarr.book_delete',
    target: { kind: 'book', id: String(volume.id) },
    metadata: { title: volume.title, seriesId: volume.seriesId },
    context: auditContext(req),
  });
  return new Response(null, { status: 204 });
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return readarrError(400, 'Invalid id');
  const volume = await getVolume(Number(id));
  if (volume === null) return readarrError(404, 'Book not found');
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return readarrError(400, 'Invalid JSON body');
  }
  const parsed = ReadarrBookPutBody.safeParse(raw);
  if (!parsed.success) return readarrError(400, 'Invalid body', parsed.error.message);

  if (parsed.data.title !== undefined) {
    await updateVolume(volume.id, { title: parsed.data.title });
  }
  // monitored is accepted and silently ignored

  const updated = await getVolume(volume.id);
  if (updated === null) return readarrError(500, 'Volume not retrievable after update');
  const series = await getSeries(updated.seriesId);
  if (series === null) return readarrError(500, 'Series not retrievable');
  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'readarr.book_update',
    target: { kind: 'book', id: String(volume.id) },
    metadata: { title: updated.title, seriesId: updated.seriesId },
    context: auditContext(req),
  });
  return NextResponse.json(volumeToReadarrBook(updated, series));
}

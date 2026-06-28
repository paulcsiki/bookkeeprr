import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { getSeries } from '@/server/db/series';
import { enqueueJob } from '@/server/db/jobs';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

/**
 * Manually re-hydrate a series' metadata. Re-runs `metadata_hydrate` (which
 * refreshes series fields, fills missing volumes, and chains chapter/volume
 * sync) and also enqueues `mangadex_volume_hydrate` directly so per-volume
 * covers/dates refresh even if the chain's preconditions aren't met. Useful for
 * series added before volume hydration existed, or to re-check after MangaDex
 * adds new cover art.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const seriesId = Number(id);
  const series = await getSeries(seriesId);
  if (!series) {
    return NextResponse.json({ error: 'series-not-found' }, { status: 404 });
  }

  await enqueueJob('metadata_hydrate', { seriesId });
  if (series.mangadexId) {
    await enqueueJob('mangadex_volume_hydrate', { seriesId });
  }
  if (series.contentType === 'light_novel') {
    await enqueueJob('googlebooks_hydrate', { seriesId });
  }
  if (series.contentType === 'ebook') {
    await enqueueJob('ebook_hydrate', { seriesId });
    await enqueueJob('book_series_detect', { seriesId });
  }
  if (series.contentType === 'audiobook') {
    await enqueueJob('audiobook_hydrate', { seriesId });
    await enqueueJob('book_series_detect', { seriesId });
  }

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'series.refresh_metadata',
    target: { kind: 'series', id: String(seriesId) },
    context: auditContext(req),
  });

  return NextResponse.json({ status: 'queued' }, { status: 202 });
}

import { NextResponse } from 'next/server';
import { listSeriesPaginated, insertSeries, getSeries } from '@/server/db/series';
import { listVolumesBySeries, insertVolume } from '@/server/db/volumes';
import { volumeToReadarrBook } from '@/server/readarr/mappers';
import { ReadarrBookPostBody } from '@/server/readarr/schemas';
import { metadataProfileToContentType, READARR_CONTENT_TYPES } from '@/server/readarr/profiles';
import { readarrError } from '@/server/readarr/auth';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request): Promise<NextResponse> {
  const { rows } = await listSeriesPaginated({
    page: 1,
    limit: 500,
    sort: 'title:asc',
    contentTypes: [...READARR_CONTENT_TYPES],
  });
  const out: Array<ReturnType<typeof volumeToReadarrBook>> = [];
  for (const s of rows) {
    const vols = await listVolumesBySeries(s.id);
    for (const v of vols) {
      out.push(volumeToReadarrBook(v, s));
    }
  }
  return NextResponse.json(out);
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return readarrError(400, 'Invalid JSON body');
  }
  const parsed = ReadarrBookPostBody.safeParse(raw);
  if (!parsed.success) {
    return readarrError(400, 'Invalid request body', parsed.error.message);
  }
  const ct = metadataProfileToContentType(parsed.data.metadataProfileId);
  if (ct === null) {
    return readarrError(400, 'Invalid metadataProfileId', 'Must be 1, 2, or 3');
  }
  try {
    const isDigits = /^\d+$/.test(parsed.data.foreignBookId);
    const seriesId = await insertSeries({
      contentType: ct,
      anilistId:
        (ct === 'light_novel' || ct === 'manga') && isDigits
          ? Number(parsed.data.foreignBookId)
          : null,
      mangadexId: ct === 'manga' && !isDigits ? parsed.data.foreignBookId : null,
      openlibraryId: ct === 'ebook' ? parsed.data.foreignBookId : null,
      asin: ct === 'audiobook' ? parsed.data.foreignBookId : null,
      comicvineId: ct === 'comic' && isDigits ? Number(parsed.data.foreignBookId) : null,
      status: 'releasing',
      rootPath: parsed.data.rootFolderPath,
      qualityProfileId: parsed.data.qualityProfileId,
      titleEnglish: parsed.data.foreignBookId,
      monitoring: parsed.data.monitored === false ? 'none' : 'all',
    });
    const volumeId = await insertVolume({
      seriesId,
      number: 1,
      title: parsed.data.foreignBookId,
    });
    const series = await getSeries(seriesId);
    const vols = await listVolumesBySeries(seriesId);
    const vol = vols.find((v) => v.id === volumeId);
    if (series === null || vol === undefined) {
      return readarrError(500, 'Volume created but not retrievable');
    }
    await recordAuditEvent({
      actor: await auditActor(req),
      action: 'readarr.book_create',
      target: { kind: 'book', id: String(volumeId) },
      metadata: { title: parsed.data.foreignBookId, seriesId, contentType: ct },
      context: auditContext(req),
    });
    return NextResponse.json(volumeToReadarrBook(vol, series), { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) return readarrError(409, 'Book already exists', msg);
    return readarrError(500, 'Insert failed', msg);
  }
}

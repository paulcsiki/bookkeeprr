import { NextResponse } from 'next/server';
import { listSeriesPaginated, insertSeries, getSeriesByAniListId } from '@/server/db/series';
import { listVolumesBySeries } from '@/server/db/volumes';
import { seriesToReadarrAuthor } from '@/server/readarr/mappers';
import { ReadarrAuthorPostBody } from '@/server/readarr/schemas';
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
  const authors = await Promise.all(
    rows.map(async (s) => {
      const volumes = await listVolumesBySeries(s.id);
      return seriesToReadarrAuthor(s, volumes);
    }),
  );
  return NextResponse.json(authors);
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return readarrError(400, 'Invalid JSON body');
  }
  const parsed = ReadarrAuthorPostBody.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path.join('.') ?? '';
    const detail = first?.message ?? 'invalid';
    const message =
      field.length > 0 ? `Invalid request body: ${field} — ${detail}` : 'Invalid request body';
    return readarrError(400, message, parsed.error.message);
  }
  const ct = metadataProfileToContentType(parsed.data.metadataProfileId);
  if (ct === null) {
    return readarrError(400, 'Invalid metadataProfileId', 'Must be 1, 2, or 3');
  }
  const foreignId = parsed.data.foreignAuthorId ?? '';
  const titleEnglish = parsed.data.authorName ?? foreignId;

  if ((ct === 'light_novel' || ct === 'manga') && /^\d+$/.test(foreignId)) {
    const existing = await getSeriesByAniListId(Number(foreignId));
    if (existing !== null) {
      return readarrError(409, 'Author already exists', `series ${existing.id}`);
    }
  }

  try {
    const isDigits = /^\d+$/.test(foreignId);
    const id = await insertSeries({
      contentType: ct,
      anilistId: (ct === 'light_novel' || ct === 'manga') && isDigits ? Number(foreignId) : null,
      mangadexId: ct === 'manga' && !isDigits ? foreignId || null : null,
      openlibraryId: ct === 'ebook' ? foreignId || null : null,
      asin: ct === 'audiobook' ? foreignId || null : null,
      comicvineId: ct === 'comic' && isDigits ? Number(foreignId) : null,
      author: parsed.data.authorName ?? null,
      status: 'releasing',
      rootPath: parsed.data.rootFolderPath,
      qualityProfileId: parsed.data.qualityProfileId,
      titleEnglish,
      monitoring: parsed.data.monitored === false ? 'none' : 'all',
    });
    const created = await import('@/server/db/series').then((m) => m.getSeries(id));
    if (created === null) return readarrError(500, 'Series created but not retrievable');
    await recordAuditEvent({
      actor: await auditActor(req),
      action: 'readarr.author_create',
      target: { kind: 'author', id: String(id) },
      metadata: { title: titleEnglish, contentType: ct },
      context: auditContext(req),
    });
    return NextResponse.json(seriesToReadarrAuthor(created, []), { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) return readarrError(409, 'Author already exists', msg);
    return readarrError(500, 'Insert failed', msg);
  }
}

import { enqueueJob } from '@/server/db/jobs';
import { getSeries } from '@/server/db/series';
import { getMediaRoot } from '@/server/content-type/paths';

export type DispatchResult =
  | { kind: 'enqueued'; jobId: number; jobKind: string }
  | { kind: 'noop'; message: string };

export async function dispatchReadarrCommand(
  name: string,
  body: Record<string, unknown>,
): Promise<DispatchResult> {
  const lc = name.toLowerCase();
  const rawAuthorId = body.authorId;
  const authorId = typeof rawAuthorId === 'number' ? rawAuthorId : Number(rawAuthorId);
  const hasAuthorId = Number.isInteger(authorId) && authorId > 0;

  if (lc === 'refreshauthor' || lc === 'refreshbook' || lc === 'refreshauthors') {
    if (!hasAuthorId) return { kind: 'noop', message: 'no authorId' };
    const series = await getSeries(authorId);
    if (series === null) return { kind: 'noop', message: 'no matching series' };
    const jobKind = series.contentType === 'comic' ? 'comicvine_hydrate' : 'metadata_hydrate';
    const jobId = await enqueueJob(jobKind, { seriesId: authorId });
    return { kind: 'enqueued', jobId, jobKind };
  }

  if (lc === 'authorsearch' || lc === 'booksearch' || lc === 'missingbooksearch') {
    if (!hasAuthorId) return { kind: 'noop', message: 'no authorId' };
    const series = await getSeries(authorId);
    if (series === null) return { kind: 'noop', message: 'no matching series' };
    const jobId = await enqueueJob('missing_search', { seriesId: authorId });
    return { kind: 'enqueued', jobId, jobKind: 'missing_search' };
  }

  if (lc === 'rescanfolders') {
    const jobId = await enqueueJob('library_scan', { rootPath: await getMediaRoot() });
    return { kind: 'enqueued', jobId, jobKind: 'library_scan' };
  }

  return { kind: 'noop', message: `unsupported command: ${name}` };
}

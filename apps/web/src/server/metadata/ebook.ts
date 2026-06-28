import { getWork, getAuthorName, buildCoverUrl } from '@/server/integrations/openlibrary/client';
import { lookupByIsbn, GoogleBooksError } from '@/server/integrations/googlebooks/client';
import { googleBooksApiKeyOrNull, googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { logger } from '@/server/logger';

export type EbookMetadata = {
  olid: string;
  title: string;
  author: string | null;
  firstPublishYear: number | null;
  isbn: string | null;
  coverUrl: string | null;
  description: string | null;
  pageCount: number | null;
};

function parseYear(s: string): number | null {
  const m = s.match(/(\d{4})/);
  return m && m[1] ? parseInt(m[1], 10) : null;
}

export async function composeEbookMetadata(
  olid: string,
  hintIsbn: string | null,
): Promise<EbookMetadata | null> {
  const work = await getWork(olid);
  if (!work) return null;

  const authorKey = work.authors?.[0]?.author?.key ?? null;
  const author = authorKey ? await getAuthorName(authorKey) : null;
  const coverUrl = work.covers?.[0] !== undefined ? buildCoverUrl(work.covers[0]) : null;
  const description =
    typeof work.description === 'string' ? work.description : (work.description?.value ?? null);
  const firstPublishYear = work.first_publish_date ? parseYear(work.first_publish_date) : null;

  let result: EbookMetadata = {
    olid,
    title: work.title,
    author,
    firstPublishYear,
    isbn: hintIsbn,
    coverUrl,
    description,
    pageCount: null,
  };

  // GB fallback only when ISBN known AND at least one gap.
  const needsGb =
    hintIsbn !== null &&
    (result.coverUrl === null || result.description === null || result.pageCount === null);

  if (needsGb && hintIsbn) {
    let apiKey: string | null = null;
    try {
      apiKey = googleBooksApiKeyOrNull(await googleBooksApiKeySetting.get());
    } catch {
      // Settings read failure — proceed keyless.
    }
    try {
      const gb = await lookupByIsbn(hintIsbn, apiKey);
      if (gb) {
        result = {
          ...result,
          coverUrl: result.coverUrl ?? gb.coverUrl,
          description: result.description ?? gb.description,
          pageCount: result.pageCount ?? gb.pageCount,
        };
      }
    } catch (err) {
      const msg = err instanceof GoogleBooksError ? err.message : (err as Error).message;
      logger()
        .child({ component: 'metadata.ebook' })
        .warn({ err: msg }, 'GB fallback failed; continuing with OL data');
    }
  }

  return result;
}

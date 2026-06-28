import { z } from 'zod';

// ---------------------------------------------------------------------------
// Raw LibriVox feed shapes (tolerant — only the fields we consume)
//
// GET /api/feed/audiobooks/?format=json&limit=N
//   → { books: [ { id, title, description, authors: [...], url_librivox, ... } ] }
// ---------------------------------------------------------------------------

const LibriVoxAuthor = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
});

export const LibriVoxBook = z.object({
  // The feed returns ids as strings; coerce defensively in case of numbers.
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  title: z.string(),
  description: z.string().nullable().optional(),
  authors: z.array(LibriVoxAuthor).optional(),
  url_librivox: z.string().nullable().optional(),
  // The feed has no cover field, but url_zip_file embeds the book's archive.org
  // identifier, from which we derive a cover thumbnail (see coverUrlFromZip).
  url_zip_file: z.string().nullable().optional(),
});

export type LibriVoxBookT = z.infer<typeof LibriVoxBook>;

export const LibriVoxFeedResponse = z.object({
  books: z.array(LibriVoxBook),
});

// ---------------------------------------------------------------------------
// Domain-mapped type (what the rest of the app consumes)
// ---------------------------------------------------------------------------

export type LibriVoxHit = {
  librivoxId: string;
  title: string;
  author: string | null;
  // Derived from the book's archive.org identifier (extracted from
  // url_zip_file); null when no identifier can be parsed.
  coverUrl: string | null;
  description: string | null;
};

/**
 * Extracts the archive.org identifier embedded in a LibriVox `url_zip_file` and
 * returns the archive.org cover-thumbnail URL, or null when the field is missing
 * or doesn't match. The identifier is the path segment between `/compress/` and
 * the next `/` — e.g.
 *   https://archive.org/compress/count_monte_cristo_0711_librivox/formats=...
 *     → https://archive.org/services/img/count_monte_cristo_0711_librivox
 */
export function coverUrlFromZip(urlZipFile: string | null | undefined): string | null {
  if (!urlZipFile) return null;
  const m = /\/compress\/([^/]+)\//.exec(urlZipFile);
  if (!m) return null;
  return `https://archive.org/services/img/${m[1]}`;
}

function blankToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Joins the first author's first + last name; null when no author present. */
function joinAuthor(authors: LibriVoxBookT['authors']): string | null {
  const a = authors?.[0];
  if (!a) return null;
  const name = [blankToNull(a.first_name), blankToNull(a.last_name)]
    .filter((p): p is string => p !== null)
    .join(' ')
    .trim();
  return name.length > 0 ? name : null;
}

export function mapLibriVoxBook(book: LibriVoxBookT): LibriVoxHit {
  return {
    librivoxId: book.id,
    title: book.title,
    author: joinAuthor(book.authors),
    coverUrl: coverUrlFromZip(book.url_zip_file),
    description: blankToNull(book.description),
  };
}

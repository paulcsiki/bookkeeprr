import { z } from 'zod';

// ---------------------------------------------------------------------------
// Raw NYT Books API v3 shapes (tolerant — only the fields we consume)
// ---------------------------------------------------------------------------

export const NytBook = z.object({
  rank: z.number().int().nullable().optional(),
  title: z.string(),
  author: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  book_image: z.string().nullable().optional(),
  primary_isbn13: z.string().nullable().optional(),
});

export type NytBookT = z.infer<typeof NytBook>;

// `GET /lists/current/{list}.json` → { status, results: { books: [...] } }
export const NytListResponse = z.object({
  status: z.string().optional(),
  results: z.object({
    books: z.array(NytBook),
  }),
});

// ---------------------------------------------------------------------------
// Domain-mapped type (what the rest of the app consumes)
// ---------------------------------------------------------------------------

export type NytAudioHit = {
  title: string;
  author: string | null;
  coverUrl: string | null;
  isbn: string | null;
  description: string | null;
  rank: number | null;
};

function blankToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mapNytBook(book: NytBookT): NytAudioHit {
  return {
    title: book.title,
    author: blankToNull(book.author),
    coverUrl: blankToNull(book.book_image),
    isbn: blankToNull(book.primary_isbn13),
    description: blankToNull(book.description),
    rank: book.rank ?? null,
  };
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchAudiobooks, AudnexError } from '@/server/integrations/audnex';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  title: z.string().min(1),
  author: z.string().optional().default(''),
});

export type ResolveAudiobookResult = {
  asin: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
} | null;

/**
 * Resolves an Audible ASIN for a no-ASIN audiobook discover tile (NYT /
 * LibriVox). Searches Audible via Audnex for "title author" and returns the top
 * hit, or `null` when nothing matches. The add flow uses the returned ASIN to
 * build the `/api/series` body; a null result aborts the add with a toast.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    title: url.searchParams.get('title') ?? undefined,
    author: url.searchParams.get('author') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid query', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const { title, author } = parsed.data;
  const query = `${title} ${author}`.trim();

  try {
    const hits = await searchAudiobooks(query);
    const top = hits[0];
    const result: ResolveAudiobookResult = top
      ? { asin: top.asin, title: top.title, author: top.author, coverUrl: top.coverUrl }
      : null;
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof AudnexError ? err.message : err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'resolve failed', detail: message }, { status: 502 });
  }
}

import { NextResponse } from 'next/server';
import { federatedLookup } from '@/server/search/federated';
import { contentTypeToMetadataProfileId } from '@/server/readarr/profiles';
import { readarrError } from '@/server/readarr/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const term = url.searchParams.get('term');
  if (term === null || term.length === 0) return readarrError(400, 'term query param required');
  const hits = await federatedLookup(term);
  const mapped = hits.map((h, idx) => ({
    foreignBookId: h.foreignId,
    title: h.title,
    authorTitle: h.author ?? '',
    metadataProfileId: contentTypeToMetadataProfileId(h.source),
    monitored: false,
    bookNumber: 1,
    authorId: idx + 1,
    images: h.coverUrl ? [{ coverType: 'cover', url: h.coverUrl }] : [],
    releaseDate: null,
    added: new Date(0).toISOString(),
  }));
  return NextResponse.json(mapped);
}

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
  const mapped = hits.map((h) => ({
    foreignAuthorId: h.foreignId,
    authorName: h.author ?? h.title,
    overview: '',
    images: h.coverUrl ? [{ coverType: 'poster', url: h.coverUrl }] : [],
    metadataProfileId: contentTypeToMetadataProfileId(
      h.source === 'light_novel' ? 'light_novel' : h.source,
    ),
    status: 'continuing',
    monitored: false,
    qualityProfileId: 0,
    rootFolderPath: '',
    path: '',
    added: new Date(0).toISOString(),
    books: [],
  }));
  return NextResponse.json(mapped);
}

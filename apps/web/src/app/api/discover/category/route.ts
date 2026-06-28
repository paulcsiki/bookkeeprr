import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBrowseCategory } from '@/server/discover/browse';
import { CONTENT_TYPES } from '@/server/content-type';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  contentType: z.enum(CONTENT_TYPES),
  row: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
});

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      contentType: url.searchParams.get('contentType') ?? undefined,
      row: url.searchParams.get('row') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid query' }, { status: 400 });
    }
    const { items, hasMore } = await getBrowseCategory(
      parsed.data.contentType,
      parsed.data.row,
      parsed.data.page,
    );
    return NextResponse.json({ items, hasMore });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'category failed', detail: message }, { status: 500 });
  }
}

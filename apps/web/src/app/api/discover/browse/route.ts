import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBrowseRows } from '@/server/discover/browse';
import { CONTENT_TYPES } from '@/server/content-type';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  contentType: z.enum(CONTENT_TYPES).optional().default('manga'),
});

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      contentType: url.searchParams.get('contentType') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid contentType' }, { status: 400 });
    }
    const rows = await getBrowseRows(parsed.data.contentType);
    return NextResponse.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'browse failed', detail: message }, { status: 500 });
  }
}

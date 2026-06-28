import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { resolveLibraryFilePath } from '@/server/reader/path-safety';
import { serveFileRange } from '@/server/reader/serve-range';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ fileId: string }> };

/**
 * Stream a PDF with HTTP range support so viewers can seek/lazy-load pages.
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { fileId } = await ctx.params;
  const r = await resolveLibraryFilePath(Number(fileId));
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error },
      { status: r.error === 'forbidden' ? 403 : 404 },
    );
  }

  return serveFileRange(req, r.path, 'application/pdf');
}

import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { resolveLibraryFilePath } from '@/server/reader/path-safety';
import { listImageEntries, readArchiveEntry } from '@/server/reader/formats/archive';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ fileId: string; n: string }> };

/**
 * Stream a single comic page image out of a cbz/cbr/zip/7z archive.
 *
 * The page index `n` is a position into the natural-sorted list of image
 * entries. Out-of-range indices are 404. Non-zip archives require the `7z`
 * binary (production only); when it is missing the archive read throws and we
 * surface 500 with the underlying message.
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { fileId, n } = await ctx.params;
  const r = await resolveLibraryFilePath(Number(fileId));
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error },
      { status: r.error === 'forbidden' ? 403 : 404 },
    );
  }

  let names: string[];
  try {
    names = await listImageEntries(r.path);
  } catch (err) {
    return NextResponse.json(
      { error: 'archive read failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const idx = Number(n);
  if (!Number.isInteger(idx) || idx < 0 || idx >= names.length) {
    return NextResponse.json({ error: 'page not found' }, { status: 404 });
  }

  let buffer: Buffer;
  let contentType: string;
  try {
    ({ buffer, contentType } = await readArchiveEntry(r.path, names[idx]!));
  } catch (err) {
    return NextResponse.json(
      { error: 'archive read failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'private, max-age=86400',
    },
  });
}

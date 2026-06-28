import { extname } from 'node:path';
import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { resolveLibraryFilePath } from '@/server/reader/path-safety';
import { serveFileRange } from '@/server/reader/serve-range';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ fileId: string }> };

/** Map an audio file extension to its MIME content type. */
function audioContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.m4b':
    case '.m4a':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    case '.flac':
      return 'audio/flac';
    case '.ogg':
      return 'audio/ogg';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Stream an audiobook file with HTTP range support so players can seek.
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

  return serveFileRange(req, r.path, audioContentType(r.path));
}

import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { resolveLibraryFilePath } from '@/server/reader/path-safety';
import { serveFileRange } from '@/server/reader/serve-range';
import { verifyEpubToken } from '@/server/reader/epub-token';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ fileId: string }> };

/**
 * Authorize a whole-file ebook download. Accepts EITHER normal human-user auth
 * (session cookie / forward-auth / bearer) via `requireUserId`, OR — scoped to
 * this file — the short-lived `?token=` the reader manifest mints (same token
 * the EPUB sub-resource route uses). `react-native-webview` only attaches the
 * Authorization header to the main document request, so the mobile foliate
 * reader fetches the file with `?token=` instead.
 */
async function isAuthorized(req: NextRequest, fileId: number): Promise<boolean> {
  const userId = await requireUserId(req);
  if (userId !== null) return true;

  const queryToken = req.nextUrl.searchParams.get('token');
  if (queryToken === null || queryToken === '') return false;
  const tokenUserId = await verifyEpubToken(queryToken, fileId, Date.now());
  return tokenUserId !== null;
}

/**
 * Stream a whole MOBI/AZW3 (or any ebook) file with HTTP range support so the
 * client-side foliate-js renderer can fetch and parse it. foliate detects the
 * format from the bytes, so the content-type is a generic octet-stream.
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { fileId } = await ctx.params;

  if (!(await isAuthorized(req, Number(fileId)))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const r = await resolveLibraryFilePath(Number(fileId));
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error },
      { status: r.error === 'forbidden' ? 403 : 404 },
    );
  }

  return serveFileRange(req, r.path, 'application/octet-stream');
}

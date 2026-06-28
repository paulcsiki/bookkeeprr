import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { resolveLibraryFilePath } from '@/server/reader/path-safety';
import { readEpubResource } from '@/server/reader/formats/epub';
import { verifyEpubToken } from '@/server/reader/epub-token';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ fileId: string }> };

/**
 * Authorize an EPUB resource request. Accepts EITHER the normal human-user
 * auth (session cookie / forward-auth) via `requireUserId`, OR — scoped to this
 * route only — a SHORT-LIVED token passed as a `?token=` query param.
 *
 * The query-param path exists because `react-native-webview` only attaches
 * `source.headers` (the Authorization header) to the MAIN document request, not
 * to the sub-resource requests the rendered HTML triggers (linked CSS, <img>,
 * fonts). Those sub-resources would otherwise hit this route with no auth and
 * 401, leaving the EPUB unstyled. The RN reader therefore appends `?token=` to
 * every same-origin sub-resource URL.
 *
 * The token here is NOT the long-lived account bearer (putting that in a URL
 * leaks it into logs / caches / history). It is a stateless, HMAC-signed token
 * scoped to this exact `{fileId, userId}` with a 1-hour TTL, minted into the
 * reader manifest. `verifyEpubToken` returns the userId or null.
 *
 * Returns true when the request is authorized.
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
 * Serve a single resource (chapter html, css, image, font, …) from inside an
 * EPUB container. The entry name is taken from the `?path=` query. Unknown or
 * traversal entry names throw inside `readEpubResource` and map to 404.
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
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

  const entryName = req.nextUrl.searchParams.get('path');
  if (entryName === null || entryName === '') {
    return NextResponse.json({ error: 'missing path' }, { status: 400 });
  }

  try {
    const { buffer, contentType } = await readEpubResource(r.path, entryName);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'private, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'resource not found' }, { status: 404 });
  }
}

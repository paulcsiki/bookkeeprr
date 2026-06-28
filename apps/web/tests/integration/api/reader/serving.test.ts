import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { issueMobileToken } from '@/server/mobile/tokens';
import { mintEpubToken, EPUB_TOKEN_TTL_MS } from '@/server/reader/epub-token';
import { insertVolume } from '@/server/db/volumes';
import { insertLibraryFile } from '@/server/db/library-files';
import { seedReaderFixtures, type ReaderFixtures } from './fixtures-helper';
import { GET as COMICS_GET } from '@/app/api/reader/comics/[fileId]/page/[n]/route';
import { GET as EPUB_GET } from '@/app/api/reader/epub/[fileId]/resource/route';
import { GET as PDF_GET } from '@/app/api/reader/pdf/[fileId]/route';
import { GET as AUDIO_GET } from '@/app/api/reader/audio/[fileId]/route';
import { GET as EBOOK_GET } from '@/app/api/reader/ebook/[fileId]/download/route';

let h: SeedHandle;
let fx: ReaderFixtures;
let cookieA: string;
let userAId: number;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  fx = await seedReaderFixtures(h);
  const userA = await insertUser({
    username: 'alice',
    passwordHash: 'x',
    role: 'admin',
    mustChangePassword: false,
  });
  userAId = userA.id;
  const sA = await createSession({ userId: userA.id, userAgent: null, ipAddress: null });
  cookieA = `bookkeeprr_session=${sA.token}`;
});

afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

function reqGet(url: string, cookie: string | null, range?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  if (range !== undefined) headers.range = range;
  return new NextRequest(url, { headers });
}

function comicsCtx(fileId: number, n: string) {
  return { params: Promise.resolve({ fileId: String(fileId), n }) };
}

function fileCtx(fileId: number) {
  return { params: Promise.resolve({ fileId: String(fileId) }) };
}

describe('reader content-serving routes', () => {
  it('GET comics page 0 returns the first image with PNG magic', async () => {
    const res = await COMICS_GET(
      reqGet(`http://localhost/api/reader/comics/${fx.cbzFileId}/page/0`, cookieA),
      comicsCtx(fx.cbzFileId, '0'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const body = Buffer.from(await res.arrayBuffer());
    expect([body[0], body[1], body[2], body[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('GET comics page out of range returns 404', async () => {
    const res = await COMICS_GET(
      reqGet(`http://localhost/api/reader/comics/${fx.cbzFileId}/page/99`, cookieA),
      comicsCtx(fx.cbzFileId, '99'),
    );
    expect(res.status).toBe(404);
  });

  it('GET comics page unauthenticated returns 401', async () => {
    const res = await COMICS_GET(
      reqGet(`http://localhost/api/reader/comics/${fx.cbzFileId}/page/0`, null),
      comicsCtx(fx.cbzFileId, '0'),
    );
    expect(res.status).toBe(401);
  });

  it('GET epub resource returns the chapter html', async () => {
    const res = await EPUB_GET(
      reqGet(
        `http://localhost/api/reader/epub/${fx.epubFileId}/resource?path=OEBPS/ch1.xhtml`,
        cookieA,
      ),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/xhtml|html/);
    const body = Buffer.from(await res.arrayBuffer()).toString('utf8');
    expect(body).toContain('<');
  });

  it('GET epub resource with a valid SCOPED ?token= (no cookie) grants access', async () => {
    const token = await mintEpubToken(fx.epubFileId, userAId, Date.now());
    const res = await EPUB_GET(
      reqGet(
        `http://localhost/api/reader/epub/${fx.epubFileId}/resource?path=OEBPS/ch1.xhtml&token=${encodeURIComponent(token)}`,
        null,
      ),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/xhtml|html/);
  });

  it('GET epub resource with a scoped token minted for a DIFFERENT fileId returns 401', async () => {
    // Token scoped to fileId+1 must NOT authorize this fileId.
    const token = await mintEpubToken(fx.epubFileId + 1, userAId, Date.now());
    const res = await EPUB_GET(
      reqGet(
        `http://localhost/api/reader/epub/${fx.epubFileId}/resource?path=OEBPS/ch1.xhtml&token=${encodeURIComponent(token)}`,
        null,
      ),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(401);
  });

  it('GET epub resource with an EXPIRED scoped token returns 401', async () => {
    // Minted far enough in the past that it has already expired.
    const past = Date.now() - EPUB_TOKEN_TTL_MS - 1000;
    const token = await mintEpubToken(fx.epubFileId, userAId, past);
    const res = await EPUB_GET(
      reqGet(
        `http://localhost/api/reader/epub/${fx.epubFileId}/resource?path=OEBPS/ch1.xhtml&token=${encodeURIComponent(token)}`,
        null,
      ),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(401);
  });

  it('GET epub resource with a garbage ?token= (no cookie) returns 401', async () => {
    const res = await EPUB_GET(
      reqGet(
        `http://localhost/api/reader/epub/${fx.epubFileId}/resource?path=OEBPS/ch1.xhtml&token=not-a-real-token`,
        null,
      ),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(401);
  });

  it('GET epub resource REJECTS a raw long-lived mobile bearer in ?token= (no longer accepted)', async () => {
    // The old behavior accepted the account bearer in the URL. That is the
    // caveat we removed: a raw bearer must NOT grant access here anymore.
    const { token } = await issueMobileToken(userAId);
    const res = await EPUB_GET(
      reqGet(
        `http://localhost/api/reader/epub/${fx.epubFileId}/resource?path=OEBPS/ch1.xhtml&token=${encodeURIComponent(token)}`,
        null,
      ),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(401);
  });

  it('GET epub resource with no auth at all returns 401', async () => {
    const res = await EPUB_GET(
      reqGet(
        `http://localhost/api/reader/epub/${fx.epubFileId}/resource?path=OEBPS/ch1.xhtml`,
        null,
      ),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(401);
  });

  it('GET epub resource with no path returns 400', async () => {
    const res = await EPUB_GET(
      reqGet(`http://localhost/api/reader/epub/${fx.epubFileId}/resource`, cookieA),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(400);
  });

  it('GET epub resource with traversal path returns 404', async () => {
    const res = await EPUB_GET(
      reqGet(
        `http://localhost/api/reader/epub/${fx.epubFileId}/resource?path=OEBPS/../secret`,
        cookieA,
      ),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(404);
  });

  it('GET epub resource with missing entry returns 404', async () => {
    const res = await EPUB_GET(
      reqGet(
        `http://localhost/api/reader/epub/${fx.epubFileId}/resource?path=OEBPS/missing.xhtml`,
        cookieA,
      ),
      fileCtx(fx.epubFileId),
    );
    expect(res.status).toBe(404);
  });

  it('GET pdf with a Range header returns 206 partial content', async () => {
    const res = await PDF_GET(
      reqGet(`http://localhost/api/reader/pdf/${fx.pdfEbookFileId}`, cookieA, 'bytes=0-9'),
      fileCtx(fx.pdfEbookFileId),
    );
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-9/460');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBe(10);
  });

  it('GET audio with a Range header returns 206', async () => {
    const res = await AUDIO_GET(
      reqGet(`http://localhost/api/reader/audio/${fx.audioFileId}`, cookieA, 'bytes=0-9'),
      fileCtx(fx.audioFileId),
    );
    expect(res.status).toBe(206);
  });

  it('GET ebook download streams the whole MOBI file with a cookie', async () => {
    const res = await EBOOK_GET(
      reqGet(`http://localhost/api/reader/ebook/${fx.mobiFileId}/download`, cookieA),
      fileCtx(fx.mobiFileId),
    );
    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer()).toString('utf8');
    expect(body).toContain('BOOKMOBI');
  });

  it('GET ebook download with a Range header returns 206 partial content', async () => {
    const res = await EBOOK_GET(
      reqGet(`http://localhost/api/reader/ebook/${fx.mobiFileId}/download`, cookieA, 'bytes=0-7'),
      fileCtx(fx.mobiFileId),
    );
    expect(res.status).toBe(206);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBe(8);
  });

  it('GET ebook download with a valid scoped ?token= (no cookie) grants access', async () => {
    const token = await mintEpubToken(fx.mobiFileId, userAId, Date.now());
    const res = await EBOOK_GET(
      reqGet(
        `http://localhost/api/reader/ebook/${fx.mobiFileId}/download?token=${encodeURIComponent(token)}`,
        null,
      ),
      fileCtx(fx.mobiFileId),
    );
    expect(res.status).toBe(200);
  });

  it('GET ebook download with a token scoped to a DIFFERENT fileId returns 401', async () => {
    const token = await mintEpubToken(fx.mobiFileId + 1, userAId, Date.now());
    const res = await EBOOK_GET(
      reqGet(
        `http://localhost/api/reader/ebook/${fx.mobiFileId}/download?token=${encodeURIComponent(token)}`,
        null,
      ),
      fileCtx(fx.mobiFileId),
    );
    expect(res.status).toBe(401);
  });

  it('GET ebook download with no auth returns 401', async () => {
    const res = await EBOOK_GET(
      reqGet(`http://localhost/api/reader/ebook/${fx.mobiFileId}/download`, null),
      fileCtx(fx.mobiFileId),
    );
    expect(res.status).toBe(401);
  });

  it('GET a library file outside the media root returns 403', async () => {
    const outsidePath = join(h.tmpDir, 'outside.cbz');
    writeFileSync(outsidePath, 'PK\x03\x04 not really a zip');
    const volId = await insertVolume({ seriesId: fx.comicsSeriesId, number: 99 });
    const outsideFileId = await insertLibraryFile({
      seriesId: fx.comicsSeriesId,
      volumeId: volId,
      path: outsidePath,
      sizeBytes: 20,
    });
    const res = await COMICS_GET(
      reqGet(`http://localhost/api/reader/comics/${outsideFileId}/page/0`, cookieA),
      comicsCtx(outsideFileId, '0'),
    );
    expect(res.status).toBe(403);
  });
});

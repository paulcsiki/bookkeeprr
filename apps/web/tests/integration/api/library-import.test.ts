import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST as POST_SCAN } from '@/app/api/library/import/scan/route';
import { POST as POST_IMPORT } from '@/app/api/library/import/route';
import { contentTypePathsSetting } from '@/server/db/settings/library';
import { getDb } from '@/server/db/client';
import { libraryFiles } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import * as matchModule from '@/server/importer/match-candidate';
import { expectShape } from '../../helpers/assert-spec';
import { MessageResponse } from '@/server/openapi/schemas/common';
import { ImportScanResponse, ImportAdoptResponse } from '@/server/openapi/schemas/library-import';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;
let ebookDir: string;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  vi.restoreAllMocks();

  // Set up a temp ebook library root with one untracked epub
  ebookDir = mkdtempSync(join(tmpdir(), 'bk-ebook-'));
  writeFileSync(join(ebookDir, 'The Great Test Book.epub'), 'fake epub content');

  const paths = await contentTypePathsSetting.get();
  await contentTypePathsSetting.set({
    ...paths,
    ebook: { ...paths.ebook, libraryRoot: ebookDir },
  });
});

afterEach(() => {
  h.cleanup();
  rmSync(ebookDir, { recursive: true, force: true });
});

async function cookieFor(role: 'admin' | 'user'): Promise<string> {
  const user = await insertUser({
    username: role === 'admin' ? 'admin' : 'plainuser',
    passwordHash: await hashPassword('hunter22'),
    role,
    mustChangePassword: false,
  });
  const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function makeReq(
  method: string,
  body: unknown | null,
  cookie: string | null,
  url: string,
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });
}

const SCAN_URL = 'http://localhost/api/library/import/scan';
const IMPORT_URL = 'http://localhost/api/library/import';

const MOCK_CANDIDATE = {
  sourceId: 'OL123W',
  title: 'The Great Test Book',
  author: 'Test Author',
  year: 2020,
  isbn: '1234567890123',
  coverUrl: null,
  source: 'openlibrary' as const,
};

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/library/import/scan', () => {
  it('returns items for untracked ebook files', async () => {
    // Mock matchScanItem to avoid real network calls
    vi.spyOn(matchModule, 'matchScanItem').mockImplementation(async (item) => ({
      ...item,
      best: { ...MOCK_CANDIDATE, title: item.detectedTitle },
      alternatives: [],
    }));

    const cookie = await cookieFor('admin');
    const res = await POST_SCAN(makeReq('POST', null, cookie, SCAN_URL));
    expect(res.status).toBe(200);
    const body = await expectShape(ImportScanResponse, res, 'POST /api/library/import/scan');
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const item = body.items.find((i) => i.path.includes('The Great Test Book.epub'));
    expect(item).toBeDefined();
    expect(item!.contentType).toBe('ebook');
    expect(item!.best).not.toBeNull();
  });

  it('returns 401 with no cookie and 403 for a non-admin', async () => {
    const noAuth = await POST_SCAN(makeReq('POST', null, null, SCAN_URL));
    expect(noAuth.status).toBe(401);
    await expectShape(MessageResponse, noAuth, 'POST /api/library/import/scan');

    const nonAdmin = await POST_SCAN(
      makeReq('POST', null, await cookieFor('user'), SCAN_URL),
    );
    expect(nonAdmin.status).toBe(403);
    await expectShape(MessageResponse, nonAdmin, 'POST /api/library/import/scan');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/library/import', () => {
  function adoptRow(extra: Partial<{ monitor: boolean }> = {}) {
    const filePath = join(ebookDir, 'The Great Test Book.epub');
    return {
      item: {
        path: filePath,
        detectedTitle: 'The Great Test Book',
        contentType: 'ebook',
        files: [filePath],
        sizeBytes: 20,
      },
      match: MOCK_CANDIDATE,
      monitor: extra.monitor ?? true,
      qualityProfileId: h.qpId,
    };
  }

  it('adopts a single ebook file (imported:1 + library_files row)', async () => {
    const cookie = await cookieFor('admin');
    const res = await POST_IMPORT(makeReq('POST', { rows: [adoptRow()] }, cookie, IMPORT_URL));
    expect(res.status).toBe(200);
    const body = await expectShape(ImportAdoptResponse, res, 'POST /api/library/import');
    expect(body.imported).toBe(1);
    expect(body.seriesIds).toHaveLength(1);
    expect(body.skipped).toHaveLength(0);

    // Verify library_files row was created
    const filePath = join(ebookDir, 'The Great Test Book.epub');
    const files = await getDb()
      .select()
      .from(libraryFiles)
      .where(eq(libraryFiles.path, filePath));
    expect(files).toHaveLength(1);
  });

  it('is idempotent — re-running the same row imports 0 new files', async () => {
    const cookie = await cookieFor('admin');
    const row = adoptRow();
    await POST_IMPORT(makeReq('POST', { rows: [row] }, cookie, IMPORT_URL));

    const res2 = await POST_IMPORT(makeReq('POST', { rows: [row] }, cookie, IMPORT_URL));
    expect(res2.status).toBe(200);
    const body2 = await expectShape(ImportAdoptResponse, res2, 'POST /api/library/import');
    expect(body2.imported).toBe(0);
    expect(body2.seriesIds).toHaveLength(1); // series id still present
    expect(body2.skipped).toHaveLength(0);
  });

  it('returns 400 on an invalid body (rows not an array)', async () => {
    const cookie = await cookieFor('admin');
    const res = await POST_IMPORT(
      makeReq('POST', { rows: 'not-an-array' }, cookie, IMPORT_URL),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 with no cookie and 403 for a non-admin', async () => {
    const noAuth = await POST_IMPORT(makeReq('POST', { rows: [] }, null, IMPORT_URL));
    expect(noAuth.status).toBe(401);
    await expectShape(MessageResponse, noAuth, 'POST /api/library/import');

    const nonAdmin = await POST_IMPORT(
      makeReq('POST', { rows: [] }, await cookieFor('user'), IMPORT_URL),
    );
    expect(nonAdmin.status).toBe(403);
    await expectShape(MessageResponse, nonAdmin, 'POST /api/library/import');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '@/server/db/client';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles';
import { POST } from '@/app/api/series/route';
import { jobs } from '@/server/db/schema';

let tmp: string;
let qpId: number;
beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-rls-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
  qpId = await seedDefaultQualityProfile();
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

function req(body: unknown): Request {
  return new Request('http://localhost/api/series', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/series enqueues a release search for a monitored series', () => {
  it('enqueues series_release_search when monitoring != none', async () => {
    const res = await POST(
      req({
        contentType: 'manga',
        anilistId: 30012,
        titleEnglish: 'Bleach',
        status: 'finished',
        rootPath: '/m/bleach',
        monitoring: 'future',
        granularity: 'volume',
        qualityProfileId: qpId,
        extraSearchTermsJson: '[]',
        totalVolumes: 74,
      }),
    );
    expect(res.status).toBe(201);
    const rows = await getDb()
      .select()
      .from(jobs)
      .where(eq(jobs.kind, 'series_release_search'));
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payloadJson).seriesId).toBeTypeOf('number');
  });

  it('enqueues for a comic add (monitored by default)', async () => {
    const res = await POST(
      req({
        contentType: 'comic',
        comicvineId: 18847,
        publisher: 'DC Comics',
        startYear: 1986,
        titleEnglish: 'Watchmen',
        qualityProfileId: qpId,
        rootPath: '/media/comics/DC Comics/Watchmen (1986)',
      }),
    );
    expect(res.status).toBeLessThan(400);
    const rows = await getDb()
      .select()
      .from(jobs)
      .where(eq(jobs.kind, 'series_release_search'));
    expect(rows).toHaveLength(1);
  });

  it('enqueues for an ebook add (monitored)', async () => {
    const res = await POST(
      req({
        contentType: 'ebook',
        flow: 'single',
        olid: 'OL27448W',
        isbn: '9780593135204',
        author: 'Andy Weir',
        title: 'Project Hail Mary',
        year: 2021,
        coverUrl: 'https://covers.openlibrary.org/b/id/12345678-L.jpg',
        description: 'A lone astronaut.',
        qualityProfileId: qpId,
        monitoring: 'all',
      }),
    );
    expect(res.status).toBe(201);
    const rows = await getDb()
      .select()
      .from(jobs)
      .where(eq(jobs.kind, 'series_release_search'));
    expect(rows).toHaveLength(1);
  });

  it('does NOT enqueue when monitoring is none', async () => {
    const res = await POST(
      req({
        contentType: 'manga',
        anilistId: 30013,
        titleEnglish: 'Bleach',
        status: 'finished',
        rootPath: '/m/bleach-none',
        monitoring: 'none',
        granularity: 'volume',
        qualityProfileId: qpId,
        extraSearchTermsJson: '[]',
        totalVolumes: 74,
      }),
    );
    expect(res.status).toBe(201);
    const rows = await getDb()
      .select()
      .from(jobs)
      .where(eq(jobs.kind, 'series_release_search'));
    expect(rows).toHaveLength(0);
  });
});

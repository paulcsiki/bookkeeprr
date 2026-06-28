import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { GET } from '@/app/api/series/route';
import { expectShape } from '../../helpers/assert-spec';
import { SeriesListResponse } from '@/server/openapi/schemas/series';
import { ErrorResponse } from '@/server/openapi/schemas/common';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  for (let i = 1; i <= 5; i++) {
    await insertSeries({
      contentType: 'manga',
      titleEnglish: `S${i}`,
      status: 'releasing',
      rootPath: `/media/comics/S${i}`,
      qualityProfileId: h.qpId,
    });
  }
});
afterEach(() => h.cleanup());

describe('GET /api/series — pagination', () => {
  it('returns paginated shape with defaults', async () => {
    const res = await GET(new NextRequest('http://localhost/api/series'));
    expect(res.status).toBe(200);
    await expectShape(SeriesListResponse, res, 'GET /api/series');
    const body = (await res.json()) as {
      rows: unknown[];
      total: number;
      page: number;
      limit: number;
    };
    expect(body.total).toBe(5);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.rows).toHaveLength(5);
  });

  it('respects page + limit', async () => {
    const res = await GET(new NextRequest('http://localhost/api/series?page=2&limit=2'));
    const body = (await res.json()) as { rows: unknown[]; page: number; limit: number };
    expect(body.page).toBe(2);
    expect(body.limit).toBe(2);
    expect(body.rows).toHaveLength(2);
  });

  it('enriches each row with the mobile summary fields (title/monitored/volumes/downloaded)', async () => {
    const { insertVolume } = await import('@/server/db/volumes');
    const { insertLibraryFile } = await import('@/server/db/library-files');
    const seriesId = await insertSeries({
      contentType: 'ebook',
      titleEnglish: 'Summary Probe',
      status: 'finished',
      rootPath: '/media/books/Summary Probe',
      qualityProfileId: h.qpId,
      monitoring: 'all',
    });
    const v1 = await insertVolume({ seriesId, number: 1, title: 'v1' });
    await insertVolume({ seriesId, number: 2, title: 'v2' });
    await insertLibraryFile({ seriesId, volumeId: v1, path: '/x/v1.epub', sizeBytes: 1 });

    const res = await GET(new NextRequest('http://localhost/api/series?limit=50'));
    await expectShape(SeriesListResponse, res, 'GET /api/series');
    const body = (await res.json()) as {
      rows: { id: number; title: string; monitored: boolean; volumes: number; downloaded: number }[];
    };
    const row = body.rows.find((r) => r.id === seriesId)!;
    expect(row.title).toBe('Summary Probe');
    expect(row.monitored).toBe(true);
    expect(row.volumes).toBe(2);
    expect(row.downloaded).toBe(1);
  });

  it('returns 400 on invalid params', async () => {
    const res = await GET(new NextRequest('http://localhost/api/series?limit=999999'));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'GET /api/series');
  });
});

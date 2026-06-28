import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { GET } from '@/app/api/calendar/route';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { expectShape } from '../../helpers/assert-spec';
import { CalendarResponse } from '@/server/openapi/schemas/calendar';
import { ErrorResponse } from '@/server/openapi/schemas/common';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

function req(query: string): Request {
  return new Request(`http://localhost/api/calendar${query}`);
}

describe('GET /api/calendar', () => {
  it('returns dated volumes inside the [from, to) window', async () => {
    await insertVolume({
      seriesId: h.seriesId,
      number: 2,
      title: 'v2',
      releaseDate: new Date('2026-06-15T00:00:00.000Z'),
    });
    // Outside the window — `to` is exclusive.
    await insertVolume({
      seriesId: h.seriesId,
      number: 3,
      title: 'v3',
      releaseDate: new Date('2026-07-01T00:00:00.000Z'),
    });

    const res = await GET(req('?from=2026-06-01&to=2026-07-01'));
    expect(res.status).toBe(200);
    const body = await expectShape(CalendarResponse, res, 'GET /api/calendar');
    expect(body.entries).toHaveLength(1);
    const entry = body.entries[0]!;
    expect(entry.date).toBe('2026-06-15');
    expect(entry.seriesId).toBe(h.seriesId);
    expect(entry.seriesTitle).toBe('Test Series');
    expect(entry.volumeTitle).toBe('v2');
  });

  it('returns an empty list when nothing falls in the window', async () => {
    const res = await GET(req('?from=2026-06-01&to=2026-06-02'));
    expect(res.status).toBe(200);
    const body = await expectShape(CalendarResponse, res, 'GET /api/calendar');
    expect(body.entries).toEqual([]);
  });

  it('400s on a malformed date', async () => {
    const res = await GET(req('?from=2026-6-1&to=2026-07-01'));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'GET /api/calendar (bad from)');
  });

  it('400s when to is not after from', async () => {
    const res = await GET(req('?from=2026-07-01&to=2026-07-01'));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'GET /api/calendar (inverted window)');
  });

  it('400s when a bound is missing', async () => {
    const res = await GET(req('?from=2026-06-01'));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'GET /api/calendar (missing to)');
  });

  it('sorts entries by date, then series title, then volume number', async () => {
    // Insert a second series so we can test the series-title sort key.
    const seriesId2 = await insertSeries({
      anilistId: 999,
      status: 'releasing',
      rootPath: '/media/comics/Alpha Series',
      qualityProfileId: h.qpId,
      titleEnglish: 'Alpha Series',
    });

    const date = '2026-06-20T00:00:00.000Z';

    // Two volumes on the same date for the same series (volume-number sort).
    await insertVolume({
      seriesId: h.seriesId,
      number: 3,
      title: 'v3',
      releaseDate: new Date(date),
    });
    await insertVolume({
      seriesId: h.seriesId,
      number: 2,
      title: 'v2',
      releaseDate: new Date(date),
    });

    // One volume for the second series on the same date (series-title sort:
    // "Alpha Series" < "Test Series").
    await insertVolume({
      seriesId: seriesId2,
      number: 1,
      title: 'alpha-v1',
      releaseDate: new Date(date),
    });

    // One volume on a later date (date sort).
    await insertVolume({
      seriesId: h.seriesId,
      number: 4,
      title: 'v4',
      releaseDate: new Date('2026-06-25T00:00:00.000Z'),
    });

    const res = await GET(req('?from=2026-06-01&to=2026-07-01'));
    expect(res.status).toBe(200);
    const body = await expectShape(CalendarResponse, res, 'GET /api/calendar (ordering)');

    // Expected order: alpha-v1, v2, v3 (all 2026-06-20), then v4 (2026-06-25).
    expect(body.entries).toHaveLength(4);
    expect(body.entries[0]!.seriesTitle).toBe('Alpha Series');
    expect(body.entries[0]!.volumeTitle).toBe('alpha-v1');
    expect(body.entries[1]!.seriesTitle).toBe('Test Series');
    expect(body.entries[1]!.volumeNumber).toBe(2);
    expect(body.entries[2]!.seriesTitle).toBe('Test Series');
    expect(body.entries[2]!.volumeNumber).toBe(3);
    expect(body.entries[3]!.date).toBe('2026-06-25');
  });
});

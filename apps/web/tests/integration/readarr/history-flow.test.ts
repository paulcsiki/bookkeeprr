import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { insertRelease } from '@/server/db/releases';
import { insertDownload, updateDownload } from '@/server/db/downloads';
import { insertLibraryFile } from '@/server/db/library-files';
import { expectShape } from '../../helpers/assert-spec';
import { ReadarrHistoryResponse } from '@/server/openapi/schemas/readarr';
import { GET as historyGET } from '@/app/api/readarr/v1/history/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('GET /api/readarr/v1/history', () => {
  it('returns empty records when there is no activity', async () => {
    const r = await historyGET(new Request('http://x/api/readarr/v1/history'));
    expect(r.status).toBe(200);
    await expectShape(ReadarrHistoryResponse, r, 'GET /api/readarr/v1/history 200');
    const body = (await r.json()) as { records: unknown[]; totalRecords: number };
    expect(body.records).toEqual([]);
    expect(body.totalRecords).toBe(0);
  });

  it('returns grabbed events for downloads', async () => {
    const seriesId = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLfoo',
      status: 'releasing',
      rootPath: '/media/books/A',
      qualityProfileId: h.qpId,
      titleEnglish: 'Foo',
    });
    const releaseId = await insertRelease({
      seriesId,
      indexerId: h.indexerId,
      indexerGuid: 'g-1',
      title: 'Foo v01',
      link: 'magnet:?xt=urn:btih:abc',
      targetKind: 'volume',
      sizeBytes: 100,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId, qbtHash: 'h1', status: 'downloading' });

    const r = await historyGET(new Request('http://x/api/readarr/v1/history'));
    await expectShape(ReadarrHistoryResponse, r, 'GET /api/readarr/v1/history 200 (grabbed)');
    const body = (await r.json()) as {
      records: Array<{ eventType: string; sourceTitle: string }>;
      totalRecords: number;
    };
    expect(body.totalRecords).toBe(1);
    expect(body.records[0]!.eventType).toBe('grabbed');
    expect(body.records[0]!.sourceTitle).toBe('Foo v01');
  });

  it('returns imported events for library files', async () => {
    const seriesId = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OL2',
      status: 'releasing',
      rootPath: '/media/books/B',
      qualityProfileId: h.qpId,
      titleEnglish: 'Bar',
    });
    const vid = await insertVolume({ seriesId, number: 1, title: 'v1' });
    await insertLibraryFile({
      seriesId,
      volumeId: vid,
      path: '/media/books/B/Bar.epub',
      sizeBytes: 500,
    });

    const r = await historyGET(new Request('http://x/api/readarr/v1/history'));
    const body = (await r.json()) as {
      records: Array<{ eventType: string; sourceTitle: string }>;
      totalRecords: number;
    };
    expect(body.totalRecords).toBe(1);
    expect(body.records[0]!.eventType).toBe('bookFileImported');
    expect(body.records[0]!.sourceTitle).toBe('/media/books/B/Bar.epub');
  });

  it('returns failed events from failed downloads with errors', async () => {
    const seriesId = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OL3',
      status: 'releasing',
      rootPath: '/media/books/C',
      qualityProfileId: h.qpId,
      titleEnglish: 'Baz',
    });
    const releaseId = await insertRelease({
      seriesId,
      indexerId: h.indexerId,
      indexerGuid: 'g-3',
      title: 'Baz v01',
      link: 'magnet:?xt=urn:btih:def',
      targetKind: 'volume',
      sizeBytes: 100,
      publishedAt: new Date(),
    });
    // insertDownload doesn't accept error; use updateDownload after.
    const dlId = await insertDownload({ releaseId, qbtHash: 'h3', status: 'failed' });
    await updateDownload(dlId, { error: 'qbt unreachable' });

    const r = await historyGET(new Request('http://x/api/readarr/v1/history'));
    const body = (await r.json()) as {
      records: Array<{ eventType: string; data: { message?: string } }>;
      totalRecords: number;
    };
    // grabbed + downloadFailed both surface for this download
    expect(body.totalRecords).toBe(2);
    const failed = body.records.find((r) => r.eventType === 'downloadFailed');
    expect(failed).toBeDefined();
    expect(failed!.data.message).toBe('qbt unreachable');
  });
});

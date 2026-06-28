import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { insertRelease } from '@/server/db/releases';
import { insertDownload, updateDownload } from '@/server/db/downloads';
import { expectShape } from '../../helpers/assert-spec';
import { ReadarrQueueResponse } from '@/server/openapi/schemas/readarr';
import { GET as queueGET } from '@/app/api/readarr/v1/queue/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

async function makeDownload(opts: {
  status: 'queued' | 'downloading' | 'completed' | 'importing' | 'imported' | 'failed' | 'superseded';
  error?: string;
}): Promise<{ downloadId: number; seriesId: number }> {
  const seriesId = await insertSeries({
    contentType: 'ebook',
    openlibraryId: `OL${Date.now()}-${Math.random()}`,
    status: 'releasing',
    rootPath: '/media/books/A',
    qualityProfileId: h.qpId,
    titleEnglish: 'Foo',
  });
  const releaseId = await insertRelease({
    seriesId,
    indexerId: h.indexerId,
    indexerGuid: `g-${Date.now()}-${Math.random()}`,
    title: 'Foo v01',
    link: 'magnet:?xt=urn:btih:abc',
    targetKind: 'volume',
    sizeBytes: 100,
    publishedAt: new Date(),
  });
  const downloadId = await insertDownload({
    releaseId,
    qbtHash: `hash-${Date.now()}-${Math.random()}`,
    status: opts.status,
  });
  if (opts.error !== undefined) {
    await updateDownload(downloadId, { error: opts.error });
  }
  return { downloadId, seriesId };
}

describe('GET /api/readarr/v1/queue', () => {
  it('returns an empty queue when there are no downloads', async () => {
    const r = await queueGET(new Request('http://x/api/readarr/v1/queue'));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { records: unknown[]; totalRecords: number };
    expect(body.records).toEqual([]);
    expect(body.totalRecords).toBe(0);
  });

  it('returns active downloads with Readarr shape', async () => {
    const { downloadId, seriesId } = await makeDownload({ status: 'downloading' });
    const r = await queueGET(new Request('http://x/api/readarr/v1/queue'));
    expect(r.status).toBe(200);
    await expectShape(ReadarrQueueResponse, r, 'GET /api/readarr/v1/queue 200');
    const body = (await r.json()) as {
      records: Array<{
        id: number;
        authorId: number;
        status: string;
        trackedDownloadState: string;
        downloadClient: string;
      }>;
      totalRecords: number;
    };
    expect(body.records).toHaveLength(1);
    expect(body.records[0]!.id).toBe(downloadId);
    expect(body.records[0]!.authorId).toBe(seriesId);
    expect(body.records[0]!.status).toBe('downloading');
    expect(body.records[0]!.trackedDownloadState).toBe('downloading');
    expect(body.records[0]!.downloadClient).toBe('qBittorrent');
    expect(body.totalRecords).toBe(1);
  });

  it('excludes downloads with status imported', async () => {
    await makeDownload({ status: 'imported' });
    const r = await queueGET(new Request('http://x/api/readarr/v1/queue'));
    const body = (await r.json()) as { records: unknown[]; totalRecords: number };
    expect(body.records).toEqual([]);
    expect(body.totalRecords).toBe(0);
  });

  it('excludes downloads with status superseded', async () => {
    await makeDownload({ status: 'superseded' });
    const r = await queueGET(new Request('http://x/api/readarr/v1/queue'));
    const body = (await r.json()) as { records: unknown[]; totalRecords: number };
    expect(body.records).toEqual([]);
    expect(body.totalRecords).toBe(0);
  });

  it('respects pageSize query param', async () => {
    await makeDownload({ status: 'downloading' });
    await makeDownload({ status: 'downloading' });
    await makeDownload({ status: 'downloading' });
    const r = await queueGET(new Request('http://x/api/readarr/v1/queue?pageSize=2&page=1'));
    const body = (await r.json()) as { records: unknown[]; totalRecords: number; pageSize: number };
    expect(body.records).toHaveLength(2);
    expect(body.totalRecords).toBe(3);
    expect(body.pageSize).toBe(2);
  });

  it('surfaces error message on failed downloads', async () => {
    await makeDownload({ status: 'failed', error: 'qbt unreachable' });
    const r = await queueGET(new Request('http://x/api/readarr/v1/queue'));
    const body = (await r.json()) as {
      records: Array<{ errorMessage: string | null; status: string }>;
    };
    expect(body.records[0]!.status).toBe('failed');
    expect(body.records[0]!.errorMessage).toBe('qbt unreachable');
  });
});

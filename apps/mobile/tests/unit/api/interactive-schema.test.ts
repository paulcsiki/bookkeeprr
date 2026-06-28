import {
  InteractiveSearchRequest,
  InteractiveSearchResponse,
  ReleaseRow,
  GrabResponse,
} from '@/api/schemas';

it('parses InteractiveSearchRequest', () => {
  const r = InteractiveSearchRequest.parse({ seriesId: 1, queryOverride: undefined });
  expect(r.seriesId).toBe(1);
});

it('parses ReleaseRow with rejection reason', () => {
  const r = ReleaseRow.parse({
    releaseId: 9,
    indexer: 'NYAA',
    title: 'Vinland.Saga.v28.[Stevenmagnet].cbz',
    sizeBytes: 333_447_168,
    seeders: 12,
    leechers: 3,
    publishedAt: '2026-05-25T20:00:00Z',
    quality: 'CBZ · HQ',
    recommended: true,
    accepted: true,
    rejectionReason: null,
    grabUrl: null,
  });
  expect(r.recommended).toBe(true);
});

it('parses ReleaseRow with rejection reason populated', () => {
  const r = ReleaseRow.parse({
    releaseId: 11,
    indexer: 'NYAA',
    title: 'Vinland.Saga.v28.RAW.JP.cbr',
    sizeBytes: 652_281_344,
    seeders: 2,
    leechers: 0,
    publishedAt: '2026-05-23T20:00:00Z',
    quality: 'LANG',
    recommended: false,
    accepted: false,
    rejectionReason: 'language not in quality profile',
    grabUrl: null,
  });
  expect(r.accepted).toBe(false);
  expect(r.rejectionReason).toBe('language not in quality profile');
});

it('parses InteractiveSearchResponse', () => {
  const r = InteractiveSearchResponse.parse({
    seriesId: 1,
    tookMs: 412,
    indexerCount: 4,
    releases: [],
  });
  expect(r.indexerCount).toBe(4);
});

it('parses GrabResponse (201)', () => {
  const r = GrabResponse.parse({ downloadId: 99, qbtHash: 'abc', status: 'queued' });
  expect(r.status).toBe('queued');
});

import {
  StorageSettings,
  DiscoverSettings,
  ScanStartResponse,
  JobStatus,
} from '@/api/schemas/library';

describe('StorageSettings', () => {
  it('parses a full storage object with after_ratio cleanup mode', () => {
    const result = StorageSettings.parse({
      contentTypePaths: {
        manga: { libraryRoot: '/media/manga', qbtCategory: 'manga' },
        comic: { libraryRoot: '/media/comics', qbtCategory: 'comics' },
      },
      torrentCleanup: {
        mode: 'after_ratio',
        ratio: 2.0,
        deleteFiles: true,
      },
      imageCache: {
        enabled: true,
        dir: '/cache/images',
      },
    });

    expect(result.contentTypePaths.manga).toEqual({
      libraryRoot: '/media/manga',
      qbtCategory: 'manga',
    });
    expect(result.contentTypePaths.comic).toEqual({
      libraryRoot: '/media/comics',
      qbtCategory: 'comics',
    });
    expect(result.torrentCleanup.mode).toBe('after_ratio');
    expect(result.torrentCleanup.ratio).toBe(2.0);
    expect(result.torrentCleanup.deleteFiles).toBe(true);
    expect(result.imageCache.enabled).toBe(true);
    expect(result.imageCache.dir).toBe('/cache/images');
  });

  it('parses a storage object with after_seed_time cleanup mode', () => {
    const result = StorageSettings.parse({
      contentTypePaths: {},
      torrentCleanup: {
        mode: 'after_seed_time',
        seedMinutes: 1440,
        deleteFiles: false,
      },
      imageCache: {
        enabled: false,
        dir: '',
      },
    });

    expect(result.torrentCleanup.mode).toBe('after_seed_time');
    expect(result.torrentCleanup.seedMinutes).toBe(1440);
    expect(result.torrentCleanup.deleteFiles).toBe(false);
  });

  it('parses a storage object with never cleanup mode (no optional fields)', () => {
    const result = StorageSettings.parse({
      contentTypePaths: {
        ebook: { libraryRoot: '/media/ebooks', qbtCategory: 'ebook' },
        audiobook: { libraryRoot: '/media/audiobooks', qbtCategory: 'audiobook' },
        light_novel: { libraryRoot: '', qbtCategory: '' },
      },
      torrentCleanup: {
        mode: 'never',
        deleteFiles: false,
      },
      imageCache: {
        enabled: false,
        dir: '',
      },
    });

    expect(result.torrentCleanup.mode).toBe('never');
    expect(result.torrentCleanup.ratio).toBeUndefined();
    expect(result.torrentCleanup.seedMinutes).toBeUndefined();
    expect(result.contentTypePaths.ebook).toEqual({
      libraryRoot: '/media/ebooks',
      qbtCategory: 'ebook',
    });
    expect(result.contentTypePaths.light_novel).toEqual({
      libraryRoot: '',
      qbtCategory: '',
    });
  });

  it('accepts all 5 content type keys', () => {
    const result = StorageSettings.parse({
      contentTypePaths: {
        manga: { libraryRoot: '/m', qbtCategory: 'c1' },
        comic: { libraryRoot: '/c', qbtCategory: 'c2' },
        light_novel: { libraryRoot: '/ln', qbtCategory: 'c3' },
        ebook: { libraryRoot: '/e', qbtCategory: 'c4' },
        audiobook: { libraryRoot: '/a', qbtCategory: 'c5' },
      },
      torrentCleanup: { mode: 'after_import', deleteFiles: true },
      imageCache: { enabled: false, dir: '' },
    });

    expect(Object.keys(result.contentTypePaths)).toHaveLength(5);
  });

  it('accepts empty contentTypePaths (partial record)', () => {
    const result = StorageSettings.parse({
      contentTypePaths: {},
      torrentCleanup: { mode: 'never', deleteFiles: false },
      imageCache: { enabled: false, dir: '' },
    });

    expect(result.contentTypePaths).toEqual({});
  });
});

describe('DiscoverSettings', () => {
  it('parses anilist trendingSource', () => {
    const result = DiscoverSettings.parse({ trendingSource: 'anilist' });
    expect(result.trendingSource).toBe('anilist');
  });

  it('parses mal trendingSource', () => {
    const result = DiscoverSettings.parse({ trendingSource: 'mal' });
    expect(result.trendingSource).toBe('mal');
  });

  it('rejects an unknown trendingSource', () => {
    expect(() => DiscoverSettings.parse({ trendingSource: 'myanimelist' })).toThrow();
  });
});

describe('ScanStartResponse', () => {
  it('parses a jobId response', () => {
    const result = ScanStartResponse.parse({ jobId: 42 });
    expect(result.jobId).toBe(42);
  });
});

describe('JobStatus', () => {
  it('parses a pending job', () => {
    const result = JobStatus.parse({ id: 1, status: 'pending', error: null });
    expect(result.id).toBe(1);
    expect(result.status).toBe('pending');
  });

  it('parses a running job', () => {
    const result = JobStatus.parse({ id: 2, status: 'running', error: null });
    expect(result.status).toBe('running');
  });

  it('parses a completed job', () => {
    const result = JobStatus.parse({ id: 3, status: 'completed', error: null });
    expect(result.status).toBe('completed');
  });

  it('parses a failed job with error text', () => {
    const result = JobStatus.parse({ id: 4, status: 'failed', error: 'something went wrong' });
    expect(result.status).toBe('failed');
    expect(result.error).toBe('something went wrong');
  });

  it('accepts all valid status values', () => {
    const statuses = ['pending', 'running', 'completed', 'failed', 'interrupted', 'cancelled'] as const;
    for (const status of statuses) {
      const result = JobStatus.parse({ id: 1, status, error: null });
      expect(result.status).toBe(status);
    }
  });

  it('rejects an unknown status', () => {
    expect(() => JobStatus.parse({ id: 1, status: 'queued', error: null })).toThrow();
  });
});

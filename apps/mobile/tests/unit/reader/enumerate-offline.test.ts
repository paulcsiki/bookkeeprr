import {
  __resetBlobUtil,
  __setDirContents,
  __setFileSize,
} from '../../mocks/blob-util';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  enumerateOfflineReadables,
  removeOfflineReadable,
} from '@/features/reader/lib/offline-download';

const ROOT = '/mock/Documents/reader';

beforeEach(() => {
  __resetBlobUtil();
});

describe('enumerateOfflineReadables', () => {
  it('returns an empty array when the root directory is empty', async () => {
    __setDirContents(ROOT, []);
    const results = await enumerateOfflineReadables();
    expect(results).toEqual([]);
  });

  it('skips entries that have no valid sidecar JSON', async () => {
    // "stale_dir" has no sidecar — readFile will return '' which is not valid JSON.
    __setDirContents(ROOT, ['stale_dir']);
    const results = await enumerateOfflineReadables();
    expect(results).toHaveLength(0);
  });

  it('returns entries for two valid sidecars + skips one stale dir', async () => {
    __setDirContents(ROOT, ['entry_a', 'entry_b', 'stale_dir']);

    const sidecarA = JSON.stringify({
      type: 'comics',
      localPaths: [`${ROOT}/entry_a/page-0`, `${ROOT}/entry_a/page-1`],
      pageCount: 2,
    });
    const sidecarB = JSON.stringify({
      type: 'audio',
      localPaths: [`${ROOT}/entry_b/track-0`],
      trackCount: 1,
    });

    // Set sidecar content in written state so readFile can return it.
    const blobUtil = ReactNativeBlobUtil.fs as unknown as {
      readFile: jest.Mock;
    };
    blobUtil.readFile.mockImplementation(async (path: string) => {
      if (path === `${ROOT}/entry_a/offline.json`) return sidecarA;
      if (path === `${ROOT}/entry_b/offline.json`) return sidecarB;
      // stale_dir/offline.json — return empty string so JSON.parse fails
      return '';
    });

    // Set file sizes for entry_a's pages.
    __setFileSize(`${ROOT}/entry_a/page-0`, 1_048_576); // 1 MB
    __setFileSize(`${ROOT}/entry_a/page-1`, 2_097_152); // 2 MB
    // entry_b track:
    __setFileSize(`${ROOT}/entry_b/track-0`, 5_242_880); // 5 MB

    const results = await enumerateOfflineReadables();

    expect(results).toHaveLength(2);

    const a = results.find((r) => r.readableKey === 'entry_a');
    expect(a).toBeDefined();
    expect(a!.bytes).toBe(3_145_728); // 1 MB + 2 MB
    expect(a!.manifest.type).toBe('comics');

    const b = results.find((r) => r.readableKey === 'entry_b');
    expect(b).toBeDefined();
    expect(b!.bytes).toBe(5_242_880);
    expect(b!.manifest.type).toBe('audio');
  });

  it('sums the cached cover into the on-disk byte total', async () => {
    __setDirContents(ROOT, ['entry_cover']);

    const sidecar = JSON.stringify({
      type: 'comics',
      localPaths: [`${ROOT}/entry_cover/page-0`, `${ROOT}/entry_cover/page-1`],
      pageCount: 2,
      coverPath: `${ROOT}/entry_cover/cover.img`,
      coverUrl: 'https://example.test/cover.jpg',
      title: 'Bunny Drop',
      contentType: 'manga',
    });

    const blobUtil = ReactNativeBlobUtil.fs as unknown as { readFile: jest.Mock };
    blobUtil.readFile.mockImplementation(async (path: string) =>
      path === `${ROOT}/entry_cover/offline.json` ? sidecar : '',
    );

    __setFileSize(`${ROOT}/entry_cover/page-0`, 1_000_000);
    __setFileSize(`${ROOT}/entry_cover/page-1`, 2_000_000);
    __setFileSize(`${ROOT}/entry_cover/cover.img`, 50_000);

    const results = await enumerateOfflineReadables();
    expect(results).toHaveLength(1);
    // pages (1M + 2M) + cover (50K) all counted.
    expect(results[0]!.bytes).toBe(3_050_000);
    // coverPath is migrated from absolute to relative on first read.
    expect(results[0]!.manifest.coverPath).toBe('reader/entry_cover/cover.img');
    expect(results[0]!.manifest.title).toBe('Bunny Drop');
  });

  it('reports 0 bytes for a stale entry whose files are missing/empty', async () => {
    // Mirrors a pre-pipeline "Bunny Drop" download: a sidecar exists but the
    // page files were never written (size 0), so the manager can flag it broken.
    __setDirContents(ROOT, ['entry_stale']);
    const sidecar = JSON.stringify({
      type: 'comics',
      localPaths: [`${ROOT}/entry_stale/page-0`],
      pageCount: 1,
    });
    const blobUtil = ReactNativeBlobUtil.fs as unknown as { readFile: jest.Mock };
    blobUtil.readFile.mockImplementation(async (path: string) =>
      path === `${ROOT}/entry_stale/offline.json` ? sidecar : '',
    );
    // No __setFileSize call → mock stat returns size 0.
    const results = await enumerateOfflineReadables();
    expect(results).toHaveLength(1);
    expect(results[0]!.bytes).toBe(0);
  });

  it('returns empty array when ls throws', async () => {
    const blobUtil = ReactNativeBlobUtil.fs as unknown as {
      ls: jest.Mock;
    };
    blobUtil.ls.mockRejectedValueOnce(new Error('no dir'));
    const results = await enumerateOfflineReadables();
    expect(results).toEqual([]);
  });

  it('skips individual entries when stat throws for a path', async () => {
    __setDirContents(ROOT, ['entry_c']);

    const sidecarC = JSON.stringify({
      type: 'pdf',
      localPaths: [`${ROOT}/entry_c/doc.pdf`],
    });

    const blobUtil = ReactNativeBlobUtil.fs as unknown as {
      readFile: jest.Mock;
      stat: jest.Mock;
    };
    blobUtil.readFile.mockImplementation(async (path: string) => {
      if (path === `${ROOT}/entry_c/offline.json`) return sidecarC;
      return '';
    });
    blobUtil.stat.mockRejectedValueOnce(new Error('stat error'));

    const results = await enumerateOfflineReadables();
    // Entry still appears, but bytes is 0 since stat failed.
    expect(results).toHaveLength(1);
    expect(results[0]!.bytes).toBe(0);
  });
});

describe('removeOfflineReadable', () => {
  it('calls unlink on the readable directory', async () => {
    await removeOfflineReadable('page:file:42');
    const blobUtil = ReactNativeBlobUtil.fs as unknown as { unlink: jest.Mock };
    expect(blobUtil.unlink).toHaveBeenCalledWith(`${ROOT}/page_file_42`);
  });

  it('does not throw when unlink fails (already gone)', async () => {
    const blobUtil = ReactNativeBlobUtil.fs as unknown as { unlink: jest.Mock };
    blobUtil.unlink.mockRejectedValueOnce(new Error('not found'));
    await expect(removeOfflineReadable('some:key')).resolves.toBeUndefined();
  });
});

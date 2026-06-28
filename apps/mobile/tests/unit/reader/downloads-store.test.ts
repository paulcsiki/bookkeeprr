import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useReaderDownloads,
  reduceEnqueue,
  reduceProgress,
  reduceComplete,
  reduceFail,
  reduceRemove,
  reduceRemoveBySafeKey,
  reconcileDownloadsWithDisk,
  DOWNLOADS_STORAGE_KEY,
  type DownloadMap,
} from '@/state/readerDownloadsStore';
import { enumerateOfflineReadables } from '@/features/reader/lib/offline-download';

jest.mock('@/features/reader/lib/offline-download', () => ({
  ...jest.requireActual('@/features/reader/lib/offline-download'),
  enumerateOfflineReadables: jest.fn(),
}));
const mockEnum = enumerateOfflineReadables as jest.MockedFunction<
  typeof enumerateOfflineReadables
>;

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await AsyncStorage.clear();
  // reset store to empty between tests
  useReaderDownloads.setState({ downloads: {} });
});

describe('readerDownloads reducers (pure)', () => {
  it('enqueue seeds a queued entry with zeroed progress', () => {
    const next = reduceEnqueue({}, 'page:file:1', { title: 'Vol 1' });
    expect(next['page:file:1']).toEqual({
      state: 'queued',
      pct: 0,
      bytes: 0,
      title: 'Vol 1',
    });
  });

  it('setProgress flips queued->downloading and records pct/bytes', () => {
    const seeded = reduceEnqueue({}, 'k', {});
    const next = reduceProgress(seeded, 'k', 42, 1024);
    expect(next.k!.state).toBe('downloading');
    expect(next.k!.pct).toBe(42);
    expect(next.k!.bytes).toBe(1024);
  });

  it('setProgress on an unknown key is a no-op', () => {
    const next = reduceProgress({}, 'missing', 10, 10);
    expect(next).toEqual({});
  });

  it('complete marks done at 100% and stores localPath', () => {
    const seeded = reduceEnqueue({}, 'k', {});
    const next = reduceComplete(seeded, 'k', '/docs/k.cbz');
    expect(next.k!.state).toBe('done');
    expect(next.k!.pct).toBe(100);
    expect(next.k!.localPath).toBe('/docs/k.cbz');
  });

  it('fail marks error and preserves prior pct/bytes', () => {
    const seeded = reduceProgress(reduceEnqueue({}, 'k', {}), 'k', 30, 500);
    const next = reduceFail(seeded, 'k');
    expect(next.k!.state).toBe('error');
    expect(next.k!.pct).toBe(30);
    expect(next.k!.bytes).toBe(500);
  });

  it('remove deletes the entry', () => {
    const seeded = reduceEnqueue({}, 'k', {});
    const next = reduceRemove(seeded, 'k');
    expect(next.k).toBeUndefined();
  });

  it('removeBySafeKey drops the entry whose readableKey maps to the safe-key dir', () => {
    // Offline dirs are keyed by the safe-key (`page:file:2` -> `page_file_2`),
    // but the store is keyed by the original readableKey. Deleting an offline
    // copy must clear the matching store entry so the reader stops resolving
    // dead file:// paths (the black-page regression).
    const seeded = reduceComplete(reduceEnqueue({}, 'page:file:2', {}), 'page:file:2', [
      '/docs/reader/page_file_2/page-0',
    ]);
    const next = reduceRemoveBySafeKey(seeded, 'page_file_2');
    expect(next['page:file:2']).toBeUndefined();
  });

  it('removeBySafeKey leaves non-matching entries and is a no-op when nothing matches', () => {
    const seeded = reduceEnqueue(reduceEnqueue({}, 'page:file:2', {}), 'page:file:9', {});
    const next = reduceRemoveBySafeKey(seeded, 'page_file_2');
    expect(next['page:file:2']).toBeUndefined();
    expect(next['page:file:9']).toBeDefined();
    // Unknown safe-key returns the same reference (no-op).
    expect(reduceRemoveBySafeKey(next, 'page_file_404')).toBe(next);
  });

  it('reconcileDownloadsWithDisk prunes done entries whose files are gone', async () => {
    const s = useReaderDownloads.getState();
    s.enqueue('page:file:2', {});
    s.complete('page:file:2', ['/p/page_file_2/page-0']);
    s.enqueue('page:file:9', {});
    s.complete('page:file:9', ['/p/page_file_9/page-0']);
    // Only file 2 is actually on disk; file 9's directory is gone.
    mockEnum.mockResolvedValueOnce([
      { readableKey: 'page_file_2', manifest: { type: 'comics', localPaths: [] }, bytes: 1, lastReadAt: 0 },
    ]);
    await reconcileDownloadsWithDisk();
    expect(useReaderDownloads.getState().getDownload('page:file:2')).toBeDefined();
    expect(useReaderDownloads.getState().getDownload('page:file:9')).toBeUndefined();
  });

  it('reconcileDownloadsWithDisk keeps in-flight (non-done) entries', async () => {
    const s = useReaderDownloads.getState();
    s.enqueue('page:file:5', {}); // queued, no dir yet
    mockEnum.mockResolvedValueOnce([]);
    await reconcileDownloadsWithDisk();
    expect(useReaderDownloads.getState().getDownload('page:file:5')).toBeDefined();
  });
});

describe('readerDownloads store', () => {
  it('enqueue/setProgress/complete drive the lifecycle + selector', () => {
    const s = useReaderDownloads.getState();
    s.enqueue('page:file:7', { title: 'Vol 7' });
    expect(useReaderDownloads.getState().getDownload('page:file:7')?.state).toBe('queued');

    useReaderDownloads.getState().setProgress('page:file:7', 50, 2048);
    expect(useReaderDownloads.getState().getDownload('page:file:7')?.state).toBe('downloading');
    expect(useReaderDownloads.getState().getDownload('page:file:7')?.pct).toBe(50);

    useReaderDownloads.getState().complete('page:file:7', '/docs/7.cbz');
    const done = useReaderDownloads.getState().getDownload('page:file:7');
    expect(done?.state).toBe('done');
    expect(done?.localPath).toBe('/docs/7.cbz');
  });

  it('fail then remove', () => {
    useReaderDownloads.getState().enqueue('k', {});
    useReaderDownloads.getState().fail('k');
    expect(useReaderDownloads.getState().getDownload('k')?.state).toBe('error');
    useReaderDownloads.getState().remove('k');
    expect(useReaderDownloads.getState().getDownload('k')).toBeUndefined();
  });

  it('getDownload returns undefined for unknown keys', () => {
    expect(useReaderDownloads.getState().getDownload('nope')).toBeUndefined();
  });

  it('persists to AsyncStorage on change', async () => {
    useReaderDownloads.getState().enqueue('persist:me', { title: 'P' });
    await flush();
    const raw = await AsyncStorage.getItem(DOWNLOADS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as DownloadMap;
    expect(parsed['persist:me']!.state).toBe('queued');
    expect(parsed['persist:me']!.title).toBe('P');
  });
});

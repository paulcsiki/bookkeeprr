import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReaderManifest } from '@/api/schemas';

// Mock the offline-download lib so the store action can be tested without the
// native file I/O. We drive its result + progress callback per test.
const mockDownload = jest.fn();
// Default the disk check to "plenty free" so flow tests aren't blocked; a test
// overrides it to exercise the guard.
const mockFreeDisk = jest.fn().mockResolvedValue(0.9);
jest.mock('@/features/reader/lib/offline-download', () => ({
  downloadReadable: (...args: unknown[]) => mockDownload(...args),
  freeDiskFraction: (...args: unknown[]) => mockFreeDisk(...args),
  networkAllowsDownload: jest.fn().mockResolvedValue(true),
  enumerateOfflineReadables: jest.fn().mockResolvedValue([]),
  wipeExpiredOfflineReadables: jest.fn().mockResolvedValue([]),
  deleteOfflineReadable: jest.fn().mockResolvedValue(undefined),
}));

// Mock the manifest fetch (the rail only knows the readableKey + creds, so the
// store fetches the manifest on demand).
const mockGet = jest.fn();
jest.mock('@/api/client', () => ({
  createApiClient: () => ({ get: mockGet }),
}));

import {
  useReaderDownloads,
  downloadReadable as downloadReadableAction,
  resumeInterruptedDownloads,
  pauseInFlightForBackground,
  shouldCancelInFlightOnAppState,
} from '@/state/readerDownloadsStore';
import { Platform } from 'react-native';

const KEY = 'page:file:42';

const manifest: ReaderManifest = {
  readableKey: KEY,
  contentType: 'comic',
  reader: 'comics',
  format: 'cbz',
  title: 'Berserk',
  seriesId: 1,
  volumeId: 7,
  pageCount: 3,
  progress: {
    readableKey: KEY,
    position: 0,
    locator: null,
    finished: false,
    restartedFromFinish: false,
  },
};

const creds = { serverUrl: 'https://srv.example', token: 'tok-1' };

beforeEach(async () => {
  await AsyncStorage.clear();
  useReaderDownloads.setState({ downloads: {} });
  mockDownload.mockReset();
  mockGet.mockReset();
  mockGet.mockResolvedValue(manifest);
});

describe('downloadReadable store action', () => {
  it('transitions queued -> downloading -> done with localPaths', async () => {
    mockDownload.mockImplementation(async (args: { onProgress?: (p: number, b: number) => void }) => {
      // queued already; drive a progress tick then complete.
      args.onProgress?.(50, 1024);
      return { ok: true, localPaths: ['/d/page-0', '/d/page-1', '/d/page-2'] };
    });

    const p = downloadReadableAction(KEY, { title: 'Berserk', ...creds });
    // Immediately after kickoff the entry is queued.
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('queued');

    const res = await p;
    expect(res.ok).toBe(true);

    const entry = useReaderDownloads.getState().getDownload(KEY);
    expect(entry?.state).toBe('done');
    expect(entry?.pct).toBe(100);
    expect(entry?.localPaths).toEqual(['/d/page-0', '/d/page-1', '/d/page-2']);
    expect(entry?.localPath).toBe('/d/page-0');
  });

  it('records progress on the way through downloading', async () => {
    let captured: number | null = null;
    mockDownload.mockImplementation(async (args: { onProgress?: (p: number, b: number) => void }) => {
      args.onProgress?.(40, 512);
      captured = useReaderDownloads.getState().getDownload(KEY)?.pct ?? null;
      return { ok: true, localPaths: ['/d/page-0'] };
    });
    await downloadReadableAction(KEY, { title: 'x', ...creds });
    expect(captured).toBe(40);
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('done');
  });

  it('retries then PAUSES the entry (keeps partial) when the download keeps failing transiently', async () => {
    mockDownload.mockResolvedValue({ ok: false, reason: 'download-failed' });
    const res = await downloadReadableAction(KEY, { title: 'x', ...creds });
    expect(res.ok).toBe(false);
    // Retried up to the cap, then the entry is left paused (not wiped) so a
    // future trigger can resume from the on-disk partial via byte-range resume.
    expect(mockDownload).toHaveBeenCalledTimes(3);
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('paused');
  });

  it('pauses (and never calls download) when the manifest fetch keeps throwing', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    const res = await downloadReadableAction(KEY, { title: 'x', ...creds });
    expect(res.ok).toBe(false);
    expect(mockDownload).not.toHaveBeenCalled();
    // Manifest fetch failure is transient — keep the entry paused for retry.
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('paused');
  });

  it('does NOT retry a terminal epub-offline-unsupported result, and wipes', async () => {
    mockDownload.mockResolvedValue({ ok: false, reason: 'epub-offline-unsupported' });
    const res = await downloadReadableAction(KEY, { title: 'x', ...creds });
    expect(res).toEqual({ ok: false, reason: 'epub-offline-unsupported' });
    expect(mockDownload).toHaveBeenCalledTimes(1); // terminal — no retry
    expect(useReaderDownloads.getState().getDownload(KEY)).toBeUndefined();
  });

  it('passes the fetched manifest + creds to the offline downloader', async () => {
    mockDownload.mockResolvedValue({ ok: true, localPaths: ['/d/doc'] });
    await downloadReadableAction(KEY, { title: 'x', ...creds });
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest,
        serverUrl: 'https://srv.example',
        token: 'tok-1',
      }),
    );
    // It fetched the manifest for this readable's fileId.
    expect(mockGet).toHaveBeenCalledWith('/api/reader/manifest?fileId=42');
  });

  it('fetches an audio manifest by volumeId', async () => {
    const audioKey = 'audio:vol:5';
    mockGet.mockResolvedValue({ ...manifest, readableKey: audioKey, reader: 'audio' });
    mockDownload.mockResolvedValue({ ok: true, localPaths: ['/d/track-0'] });
    await downloadReadableAction(audioKey, { title: 'x', ...creds });
    expect(mockGet).toHaveBeenCalledWith('/api/reader/manifest?volumeId=5');
  });

  it('refuses and errors when free disk is below 10%', async () => {
    mockFreeDisk.mockResolvedValueOnce(0.05);
    const res = await downloadReadableAction(KEY, { title: 'Berserk', ...creds });
    expect(res).toEqual({ ok: false, reason: 'insufficient-storage' });
    expect(mockDownload).not.toHaveBeenCalled();
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('error');
  });

  it('rejects a second concurrent start for the same key (in-flight guard)', async () => {
    // Hold the first download open so the second start overlaps it.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    mockDownload.mockImplementation(async () => {
      await gate;
      return { ok: true, localPaths: ['/d/page-0'] };
    });

    const first = downloadReadableAction(KEY, { title: 'Berserk', ...creds });
    // While the first is still in flight, a second start for the SAME key is
    // refused as in-flight (no second orchestration).
    const second = await downloadReadableAction(KEY, { title: 'Berserk', ...creds });
    expect(second).toEqual({ ok: false, reason: 'in-flight' });

    release();
    expect(await first).toEqual({ ok: true });
    expect(mockDownload).toHaveBeenCalledTimes(1); // only the first orchestration ran
  });
});

describe('resumeInterruptedDownloads', () => {
  it('restarts an entry stuck in downloading, reusing its stored meta', async () => {
    // Seed a store entry left mid-download (as a background/suspend would).
    useReaderDownloads.setState({
      downloads: {
        [KEY]: {
          state: 'downloading',
          pct: 30,
          bytes: 512,
          title: 'Berserk',
          contentType: 'comic',
          seriesName: 'Berserk',
          coverUrl: '/api/img/cover',
          volumeLabel: 'Vol. 7',
        },
      },
    });
    mockDownload.mockResolvedValue({ ok: true, localPaths: ['/d/page-0', '/d/page-1', '/d/page-2'] });

    await resumeInterruptedDownloads(creds);

    // It re-ran the real download once, with the entry's stored meta.
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest,
        serverUrl: 'https://srv.example',
        token: 'tok-1',
        title: 'Berserk',
        seriesName: 'Berserk',
        coverUrl: '/api/img/cover',
      }),
    );
    // The stuck entry recovered to done.
    const entry = useReaderDownloads.getState().getDownload(KEY);
    expect(entry?.state).toBe('done');
  });

  it('does not restart a completed download', async () => {
    useReaderDownloads.setState({
      downloads: {
        [KEY]: { state: 'done', pct: 100, bytes: 1024, localPaths: ['/d/page-0'] },
      },
    });
    await resumeInterruptedDownloads(creds);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('resumeInterruptedDownloads re-runs paused entries', async () => {
    // Seed a store entry left paused after exhausting retry attempts (as Task 2
    // now marks transient failures). The driver must include 'paused' in its
    // filter so byte-resume can pick up where the partial left off.
    useReaderDownloads.setState({
      downloads: {
        [KEY]: {
          state: 'paused',
          pct: 55,
          bytes: 900,
          title: 'Berserk',
          contentType: 'comic',
          seriesName: 'Berserk',
          coverUrl: '/api/img/cover',
          volumeLabel: 'Vol. 7',
        },
      },
    });
    mockDownload.mockResolvedValue({ ok: true, localPaths: ['/d/page-0', '/d/page-1', '/d/page-2'] });

    await resumeInterruptedDownloads(creds);

    // It re-ran the real download once, with the entry's stored meta.
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest,
        serverUrl: 'https://srv.example',
        token: 'tok-1',
        title: 'Berserk',
        seriesName: 'Berserk',
        coverUrl: '/api/img/cover',
      }),
    );
    // The paused entry recovered to done.
    const entry = useReaderDownloads.getState().getDownload(KEY);
    expect(entry?.state).toBe('done');
  });

  it('is best-effort: a failing key never throws and does not block others', async () => {
    useReaderDownloads.setState({
      downloads: {
        'page:file:1': { state: 'queued', pct: 0, bytes: 0, title: 'A' },
        'page:file:2': { state: 'downloading', pct: 10, bytes: 1, title: 'B' },
      },
    });
    // First key short-circuits on the disk guard (no retry loop, never throws);
    // the second key proceeds to a real download.
    mockFreeDisk.mockResolvedValueOnce(0.05); // first key only
    mockGet.mockResolvedValue({ ...manifest, readableKey: 'page:file:2' });
    mockDownload.mockResolvedValue({ ok: true, localPaths: ['/d/page-0'] });

    await expect(resumeInterruptedDownloads(creds)).resolves.toBeUndefined();
    // The second key still got its download attempt despite the first being refused.
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });
});

describe('pauseInFlightForBackground', () => {
  /**
   * Drive a download that hangs until its registered cancel fn is invoked, so we
   * can simulate the app going to the background mid-transfer. The mock calls the
   * orchestration's `onTask` with a cancel that rejects the hanging fetch — the
   * same wiring rnbu uses on a device. `started` resolves once the orchestration
   * has reached the hanging point with its cancel registered.
   */
  function holdableDownload(): { cancelInvoked: () => boolean; started: Promise<void> } {
    let cancelled = false;
    let markStarted!: () => void;
    const started = new Promise<void>((r) => {
      markStarted = r;
    });
    mockDownload.mockImplementation(
      async (args: {
        onProgress?: (p: number, b: number) => void;
        onTask?: (cancel: () => void) => void;
      }) => {
        // Report some progress so the entry is mid-download at a real %.
        args.onProgress?.(20, 2048);
        // Hang until the registered cancel rejects us (as a background-cancel does).
        await new Promise<void>((_resolve, reject) => {
          args.onTask?.(() => {
            cancelled = true;
            reject(new Error('canceled'));
          });
          // The orchestration is now mid-download with its cancel registered.
          markStarted();
        });
        // Unreachable in the cancelled path; a normal completion would return ok.
        return { ok: true, localPaths: ['/d/page-0'] };
      },
    );
    return { cancelInvoked: () => cancelled, started };
  }

  it('cancels each in-flight key and marks it paused (not error), keeping pct/bytes', async () => {
    const { cancelInvoked, started } = holdableDownload();

    // Start a download; it hangs in-flight (registers its cancel) and reports 20%.
    const inflight = downloadReadableAction(KEY, { title: 'Berserk', ...creds });
    await started; // wait until mid-download with cancel registered
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('downloading');
    expect(useReaderDownloads.getState().getDownload(KEY)?.pct).toBe(20);

    // App goes to background → cancel + pause.
    pauseInFlightForBackground();
    const res = await inflight; // the cancelled orchestration unwinds

    expect(cancelInvoked()).toBe(true);
    expect(res.ok).toBe(false); // cancelled, not completed
    const entry = useReaderDownloads.getState().getDownload(KEY);
    expect(entry?.state).toBe('paused'); // transient, NOT error
    expect(entry?.pct).toBe(20); // last-known progress preserved
    expect(entry?.bytes).toBe(2048); // bytes preserved → Range-resume can continue
  });

  it('does NOT retry while backgrounded — settles paused after a single attempt', async () => {
    const { started } = holdableDownload();
    const inflight = downloadReadableAction(KEY, { title: 'Berserk', ...creds });
    await started;
    pauseInFlightForBackground();
    await inflight;
    // The hanging attempt was cancelled; the retry loop broke out (no re-attempt).
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('paused');
  });

  it('is a no-op (never throws) when nothing is in flight', () => {
    expect(() => pauseInFlightForBackground()).not.toThrow();
  });

  it('clears the cancel registry once a download settles (no stale cancel fn)', async () => {
    // A normally-completing download must not leave a registered cancel behind:
    // after it settles, a background-pause finds nothing to cancel.
    let secondCancel = false;
    mockDownload.mockImplementation(
      async (args: { onTask?: (cancel: () => void) => void }) => {
        args.onTask?.(() => {
          secondCancel = true;
        });
        return { ok: true, localPaths: ['/d/page-0'] };
      },
    );
    await downloadReadableAction(KEY, { title: 'Berserk', ...creds });
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('done');

    // The download has settled; its cancel fn should be deregistered.
    pauseInFlightForBackground();
    expect(secondCancel).toBe(false); // stale cancel was NOT invoked
  });

  it('background→foreground: a paused entry is re-run by resumeInterruptedDownloads', async () => {
    // 1) Background a running download → it ends paused with progress kept.
    const { started } = holdableDownload();
    const inflight = downloadReadableAction(KEY, { title: 'Berserk', ...creds });
    await started;
    pauseInFlightForBackground();
    await inflight;
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('paused');

    // 2) Foreground → resumeInterruptedDownloads picks up the now-paused entry and
    //    re-runs it (the Range-resume from the partial is covered by the
    //    resumable-fetch unit tests). This one completes.
    mockDownload.mockResolvedValue({ ok: true, localPaths: ['/d/page-0'] });
    await resumeInterruptedDownloads(creds);
    expect(useReaderDownloads.getState().getDownload(KEY)?.state).toBe('done');
  });
});

describe('shouldCancelInFlightOnAppState', () => {
  const orig = Platform.OS;
  afterEach(() => {
    (Platform as { OS: string }).OS = orig;
  });

  it('does NOT cancel on iOS (background session keeps running)', () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(shouldCancelInFlightOnAppState('background')).toBe(false);
    expect(shouldCancelInFlightOnAppState('inactive')).toBe(false);
    expect(shouldCancelInFlightOnAppState('active')).toBe(false);
  });

  it('cancels when leaving foreground off iOS', () => {
    (Platform as { OS: string }).OS = 'android';
    expect(shouldCancelInFlightOnAppState('background')).toBe(true);
    expect(shouldCancelInFlightOnAppState('inactive')).toBe(true);
    expect(shouldCancelInFlightOnAppState('active')).toBe(false);
  });
});

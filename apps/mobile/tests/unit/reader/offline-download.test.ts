import {
  __resetBlobUtil,
  __getFetchCalls,
  __failNextFetch,
  __emitProgress,
  __getUnlinked,
  __getWritten,
  __setFileSize,
  __holdNextFetch,
} from '../../mocks/blob-util';
import {
  downloadReadable,
  localReadableDir,
  deleteOfflineReadable,
  offlineManifestPath,
  rnbuFetchFile,
  rnbuDownloadConfig,
} from '@/features/reader/lib/offline-download';
import type { ReaderManifest } from '@/api/schemas';
import { Platform } from 'react-native';

const SERVER = 'https://srv.example';
const TOKEN = 'tok-xyz';

function baseProgress(readableKey: string): ReaderManifest['progress'] {
  return {
    readableKey,
    position: 0,
    locator: null,
    finished: false,
    restartedFromFinish: false,
  };
}

const comicsManifest: ReaderManifest = {
  readableKey: 'page:file:42',
  contentType: 'comic',
  reader: 'comics',
  format: 'cbz',
  title: 'Berserk',
  seriesId: 1,
  volumeId: 7,
  pageCount: 3,
  progress: baseProgress('page:file:42'),
};

const pdfManifest: ReaderManifest = {
  readableKey: 'page:file:99',
  contentType: 'ebook',
  reader: 'comics',
  format: 'pdf',
  title: 'A Doc',
  seriesId: 2,
  volumeId: 3,
  pageCount: 12,
  progress: baseProgress('page:file:99'),
};

const mobiManifest: ReaderManifest = {
  readableKey: 'page:file:77',
  contentType: 'ebook',
  reader: 'text',
  format: 'mobi',
  title: 'The Time Machine',
  seriesId: 9,
  volumeId: 11,
  progress: baseProgress('page:file:77'),
};

const audioManifest: ReaderManifest = {
  readableKey: 'audio:vol:5',
  contentType: 'audiobook',
  reader: 'audio',
  format: 'audio',
  title: 'An Audiobook',
  seriesId: 4,
  volumeId: 5,
  tracks: [
    { idx: 0, fileId: 100, durationSec: 60, title: 'One' },
    { idx: 1, fileId: 101, durationSec: 90, title: 'Two' },
  ],
  progress: baseProgress('audio:vol:5'),
};

const epubManifest: ReaderManifest = {
  readableKey: 'page:file:7',
  contentType: 'ebook',
  reader: 'text',
  format: 'epub',
  title: 'An EPUB',
  seriesId: 6,
  volumeId: 8,
  progress: baseProgress('page:file:7'),
};

beforeEach(() => {
  __resetBlobUtil();
});

describe('localReadableDir', () => {
  it('builds a DocumentDir path with a filesystem-safe key segment', () => {
    expect(localReadableDir('page:file:42')).toBe('/mock/Documents/reader/page_file_42');
    expect(localReadableDir('audio:vol:5')).toBe('/mock/Documents/reader/audio_vol_5');
  });
});

describe('downloadReadable — comics', () => {
  it('fetches every page URL with the bearer header to per-page paths', async () => {
    const res = await downloadReadable({
      manifest: comicsManifest,
      serverUrl: SERVER,
      token: TOKEN,
    });

    expect(res.ok).toBe(true);
    const calls = __getFetchCalls();
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.url)).toEqual([
      `${SERVER}/api/reader/comics/42/page/0`,
      `${SERVER}/api/reader/comics/42/page/1`,
      `${SERVER}/api/reader/comics/42/page/2`,
    ]);
    for (const c of calls) {
      expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    }
    if (res.ok) {
      expect(res.localPaths).toHaveLength(3);
      // localPaths are now stored RELATIVE to DocumentDir (container-independent).
      expect(res.localPaths[0]).toBe('reader/page_file_42/page-0');
    }
  });

  it('reports aggregate progress to 100% across the pages', async () => {
    const seen: number[] = [];
    const res = await downloadReadable({
      manifest: comicsManifest,
      serverUrl: SERVER,
      token: TOKEN,
      onProgress: (pct) => seen.push(pct),
    });
    expect(res.ok).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(100);
    // monotonic non-decreasing
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
  });

  it('forwards live per-file byte progress while a fetch is in flight', async () => {
    const seen: Array<[number, number]> = [];
    // A single-page comic so exactly one fetch (and one progress channel) exists.
    const single: ReaderManifest = { ...comicsManifest, pageCount: 1 };
    const p = downloadReadable({
      manifest: single,
      serverUrl: SERVER,
      token: TOKEN,
      onProgress: (pct, bytes) => seen.push([pct, bytes]),
    });
    // Let the orchestrator reach the in-flight fetch (it awaits a mkdir first),
    // then drive the progress callback it registered.
    await new Promise((r) => setTimeout(r, 0));
    __emitProgress(512, 1024);
    const res = await p;
    expect(res.ok).toBe(true);
    // The live byte count surfaced via onProgress as the fetch streamed.
    expect(seen.some(([, bytes]) => bytes === 512)).toBe(true);
    // And a terminal 100% was reported on completion.
    expect(seen.some(([pct]) => pct === 100)).toBe(true);
  });

  it('writes an offline manifest JSON mapping the readableKey', async () => {
    await downloadReadable({ manifest: comicsManifest, serverUrl: SERVER, token: TOKEN });
    const written = __getWritten();
    const path = offlineManifestPath('page:file:42');
    expect(written[path]).toBeDefined();
    const parsed = JSON.parse(written[path]!) as { type: string; pageCount: number };
    expect(parsed.type).toBe('comics');
    expect(parsed.pageCount).toBe(3);
  });

  it('persists seriesName + a local coverPath in the sidecar', async () => {
    __setFileSize(`${localReadableDir('page:file:42')}/cover.img`, 4096);
    await downloadReadable({
      manifest: comicsManifest,
      serverUrl: SERVER,
      token: TOKEN,
      coverUrl: `${SERVER}/cover.png`,
      title: 'Berserk',
      contentType: 'manga',
      seriesName: 'Berserk (series)',
    });
    const raw = __getWritten()[offlineManifestPath('page:file:42')]!;
    const sidecar = JSON.parse(raw) as { seriesName?: string; coverPath?: string };
    expect(sidecar.seriesName).toBe('Berserk (series)');
    expect(sidecar.coverPath).toContain('cover.img');
  });
});

describe('downloadReadable — cover credential hygiene', () => {
  it('server-relative coverUrl is prefixed with serverUrl and sent with NO auth (covers are public via /api/img)', async () => {
    await downloadReadable({
      manifest: comicsManifest,
      serverUrl: SERVER,
      token: TOKEN,
      coverUrl: '/api/covers/volume/7',
    });
    const calls = __getFetchCalls();
    const cover = calls.find((c) => c.path?.endsWith('/cover.img'));
    expect(cover).toBeDefined();
    expect(cover!.url).toBe(`${SERVER}/api/covers/volume/7`);
    expect(cover!.headers.Authorization).toBeUndefined(); // server covers need no bearer
  });

  it('absolute external CDN coverUrl is fetched as-is with NO auth header', async () => {
    const cdn = 'https://uploads.mangadex.org/covers/abc/def.jpg';
    await downloadReadable({
      manifest: comicsManifest,
      serverUrl: SERVER,
      token: TOKEN,
      coverUrl: cdn,
    });
    const calls = __getFetchCalls();
    const cover = calls.find((c) => c.path?.endsWith('/cover.img'));
    expect(cover).toBeDefined();
    expect(cover!.url).toBe(cdn); // no serverUrl prefix
    expect(cover!.headers.Authorization).toBeUndefined(); // never leak the server token
  });
});

describe('downloadReadable — pdf', () => {
  it('fetches the single pdf file URL to doc.pdf', async () => {
    const res = await downloadReadable({
      manifest: pdfManifest,
      serverUrl: SERVER,
      token: TOKEN,
    });
    expect(res.ok).toBe(true);
    const calls = __getFetchCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${SERVER}/api/reader/pdf/99`);
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    if (res.ok) {
      // localPaths are now RELATIVE to DocumentDir.
      expect(res.localPaths[0]).toBe('reader/page_file_99/doc.pdf');
    }
  });
});

describe('downloadReadable — mobi/azw3', () => {
  it('fetches the whole ebook file from the download route to book.<fmt>', async () => {
    const res = await downloadReadable({
      manifest: mobiManifest,
      serverUrl: SERVER,
      token: TOKEN,
    });
    expect(res.ok).toBe(true);
    const calls = __getFetchCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${SERVER}/api/reader/ebook/77/download`);
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    if (res.ok) {
      expect(res.localPaths[0]).toBe('reader/page_file_77/book.mobi');
    }
  });
});

describe('downloadReadable — audio', () => {
  it('fetches each track URL to track-<idx> paths', async () => {
    const res = await downloadReadable({
      manifest: audioManifest,
      serverUrl: SERVER,
      token: TOKEN,
    });
    expect(res.ok).toBe(true);
    const calls = __getFetchCalls();
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.url)).toEqual([
      `${SERVER}/api/reader/audio/100`,
      `${SERVER}/api/reader/audio/101`,
    ]);
    if (res.ok) expect(res.localPaths).toHaveLength(2);
  });
});

describe('downloadReadable — epub', () => {
  it('is unsupported offline', async () => {
    const res = await downloadReadable({
      manifest: epubManifest,
      serverUrl: SERVER,
      token: TOKEN,
    });
    expect(res).toEqual({ ok: false, reason: 'epub-offline-unsupported' });
    expect(__getFetchCalls()).toHaveLength(0);
  });
});

describe('downloadReadable — error handling', () => {
  it('returns { ok:false } when a fetch throws', async () => {
    __failNextFetch(new Error('boom'));
    const res = await downloadReadable({
      manifest: comicsManifest,
      serverUrl: SERVER,
      token: TOKEN,
    });
    expect(res.ok).toBe(false);
  });
});

describe('deleteOfflineReadable', () => {
  it('unlinks the readable directory', async () => {
    await deleteOfflineReadable('page:file:42');
    expect(__getUnlinked()).toContain('/mock/Documents/reader/page_file_42');
  });
});

describe('rnbuFetchFile cancellation plumbing', () => {
  it('registers a cancel via onTask that aborts the in-flight native fetch', async () => {
    // The next fetch hangs until cancelled (mirrors a suspended NSURLSession).
    __holdNextFetch();
    let cancel: (() => void) | undefined;
    const p = rnbuFetchFile(
      'http://x/page-0',
      { Authorization: 'Bearer t' },
      '/d/page-0',
      () => {},
      (c) => {
        cancel = c;
      },
    );
    // onTask handed us the task's cancel.
    expect(typeof cancel).toBe('function');
    // Invoking it rejects the hanging fetch (the partial would stay on disk).
    cancel!();
    await expect(p).rejects.toThrow(/canceled/);
  });
});

describe('rnbuDownloadConfig', () => {
  const orig = Platform.OS;
  afterEach(() => {
    (Platform as { OS: string }).OS = orig;
  });

  it('uses a background NSURLSession and NO request timeout on iOS', () => {
    (Platform as { OS: string }).OS = 'ios';
    const cfg = rnbuDownloadConfig('/docs/reader/x/page-0');
    expect(cfg).toEqual({ path: '/docs/reader/x/page-0', IOSBackgroundTask: true });
    expect('timeout' in cfg).toBe(false);
  });

  it('uses the foreground data task with a 60s timeout off iOS', () => {
    (Platform as { OS: string }).OS = 'android';
    const cfg = rnbuDownloadConfig('/docs/reader/x/page-0');
    expect(cfg).toEqual({ path: '/docs/reader/x/page-0', timeout: 60_000 });
    expect('IOSBackgroundTask' in cfg).toBe(false);
  });
});

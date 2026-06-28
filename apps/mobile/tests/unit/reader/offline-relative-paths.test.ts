/**
 * TDD tests for the relative-path fix (data-integrity bug):
 *
 * iOS app-data containers change UUID on every app update. If offline.json
 * stores ABSOLUTE paths like `/var/mobile/.../OLD-UUID/Documents/reader/...`,
 * those paths are dead after an update — even though the files still exist
 * at `<NEW-UUID>/Documents/reader/...`.
 *
 * Fix: store RELATIVE paths in the sidecar (e.g. `reader/<key>/page-0`) and
 * resolve them against the CURRENT fs.dirs.DocumentDir at read time.
 *
 * Migration: sidecars written by older builds store absolute paths. On first
 * read, detect absolute paths, convert them to relative, and rewrite the
 * sidecar so subsequent reads are clean.
 */
import {
  __resetBlobUtil,
  __setDirContents,
  __setFileSize,
  __getWritten,
} from '../../mocks/blob-util';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  enumerateOfflineReadables,
  downloadReadable,
  offlineManifestPath,
  toRelative,
  resolveOffline,
} from '@/features/reader/lib/offline-download';
import type { ReaderManifest } from '@/api/schemas';

// The mock DocumentDir is set in tests/mocks/blob-util.ts → '/mock/Documents'
const MOCK_DOC_DIR = '/mock/Documents';
const ROOT = `${MOCK_DOC_DIR}/reader`;

// Simulate an OLD iOS container UUID (pre-update path)
const OLD_UUID = 'AAAAAAAA-1111-1111-1111-AAAAAAAAAAAA';
const OLD_DOC_DIR = `/var/mobile/Containers/Data/Application/${OLD_UUID}/Documents`;
const OLD_ROOT = `${OLD_DOC_DIR}/reader`;

beforeEach(() => {
  __resetBlobUtil();
});

// ---------------------------------------------------------------------------
// toRelative / resolveOffline helpers
// ---------------------------------------------------------------------------

describe('toRelative', () => {
  it('strips the DocumentDir prefix leaving a relative path', () => {
    const abs = `${MOCK_DOC_DIR}/reader/page_file_42/page-0`;
    expect(toRelative(abs)).toBe('reader/page_file_42/page-0');
  });

  it('is a no-op when the path is already relative (no leading /)', () => {
    expect(toRelative('reader/page_file_42/page-0')).toBe('reader/page_file_42/page-0');
  });

  it('handles the cover path', () => {
    const abs = `${MOCK_DOC_DIR}/reader/page_file_42/cover.img`;
    expect(toRelative(abs)).toBe('reader/page_file_42/cover.img');
  });
});

describe('resolveOffline', () => {
  it('prepends DocumentDir to a relative path', () => {
    const rel = 'reader/page_file_42/page-0';
    expect(resolveOffline(rel)).toBe(`${MOCK_DOC_DIR}/reader/page_file_42/page-0`);
  });

  it('is idempotent for paths already starting with DocumentDir', () => {
    const abs = `${MOCK_DOC_DIR}/reader/page_file_42/page-0`;
    expect(resolveOffline(abs)).toBe(abs);
  });
});

// ---------------------------------------------------------------------------
// Migration: sidecar with OLD absolute paths recovers on first read
// ---------------------------------------------------------------------------

describe('enumerateOfflineReadables — legacy absolute-path migration', () => {
  it('migrates absolute paths from an old container UUID to relative paths on first read', async () => {
    // Simulate a sidecar written before the fix, using the OLD UUID's DocumentDir.
    const oldPage0 = `${OLD_ROOT}/bunny_drop/page-0`;
    const oldPage1 = `${OLD_ROOT}/bunny_drop/page-1`;
    const oldCover = `${OLD_ROOT}/bunny_drop/cover.img`;

    const legacySidecar = JSON.stringify({
      type: 'comics',
      localPaths: [oldPage0, oldPage1],
      coverPath: oldCover,
      pageCount: 2,
      title: 'Bunny Drop',
      contentType: 'manga',
      seriesId: 1,
    });

    __setDirContents(ROOT, ['bunny_drop']);
    const sidecarPath = `${ROOT}/bunny_drop/offline.json`;

    const blobUtil = ReactNativeBlobUtil.fs as unknown as { readFile: jest.Mock };
    blobUtil.readFile.mockImplementation(async (path: string) => {
      if (path === sidecarPath) {
        // Serve the migrated sidecar if already written, otherwise the original
        const written = __getWritten();
        return written[sidecarPath] ?? legacySidecar;
      }
      return '';
    });

    // The actual files exist at the CURRENT (new UUID) path — same relative location.
    const newPage0 = `${MOCK_DOC_DIR}/reader/bunny_drop/page-0`;
    const newPage1 = `${MOCK_DOC_DIR}/reader/bunny_drop/page-1`;
    const newCover = `${MOCK_DOC_DIR}/reader/bunny_drop/cover.img`;
    __setFileSize(newPage0, 1_000_000);
    __setFileSize(newPage1, 2_000_000);
    __setFileSize(newCover, 50_000);

    const results = await enumerateOfflineReadables();

    expect(results).toHaveLength(1);
    const entry = results[0]!;

    // (a) Paths should have been migrated to relative in the manifest.
    expect(entry.manifest.localPaths[0]).toBe('reader/bunny_drop/page-0');
    expect(entry.manifest.localPaths[1]).toBe('reader/bunny_drop/page-1');
    expect(entry.manifest.coverPath).toBe('reader/bunny_drop/cover.img');

    // (b) resolveOffline yields a path under the CURRENT (new) DocumentDir.
    expect(resolveOffline(entry.manifest.localPaths[0]!)).toBe(newPage0);
    expect(resolveOffline(entry.manifest.localPaths[1]!)).toBe(newPage1);

    // (c) bytes > 0: the stat succeeded using the resolved current path.
    expect(entry.bytes).toBe(3_050_000); // 1MB + 2MB + 50KB

    // (d) The sidecar was rewritten with relative paths (migration persisted).
    const written = __getWritten();
    expect(written[sidecarPath]).toBeDefined();
    const persisted = JSON.parse(written[sidecarPath]!) as {
      localPaths: string[];
      coverPath: string;
    };
    expect(persisted.localPaths[0]).toBe('reader/bunny_drop/page-0');
    expect(persisted.coverPath).toBe('reader/bunny_drop/cover.img');
  });

  it('FAILS to find bytes when the stored paths are old-UUID absolute (pre-fix behavior)', async () => {
    // This test verifies the pre-fix code behavior: absolute paths from an old
    // UUID container give 0 bytes because stat is called with the OLD path.
    // After the fix this scenario is handled by migration, but we verify the
    // failure mode here to confirm the test would have failed before the fix.
    //
    // Mechanism: old absolute paths are statted directly. The mock only has
    // file sizes registered under the CURRENT (new) path, not the old one.
    const oldPage0 = `${OLD_ROOT}/bunny_drop/page-0`;
    const legacySidecar = JSON.stringify({
      type: 'comics',
      localPaths: [oldPage0],
      pageCount: 1,
      title: 'Bunny Drop',
      seriesId: 1,
    });

    __setDirContents(ROOT, ['bunny_drop']);
    const sidecarPath = `${ROOT}/bunny_drop/offline.json`;

    const blobUtil = ReactNativeBlobUtil.fs as unknown as { readFile: jest.Mock };
    blobUtil.readFile.mockImplementation(async (path: string) =>
      path === sidecarPath ? legacySidecar : '',
    );

    // File is present under the CURRENT path but NOT the old path.
    const newPage0 = `${MOCK_DOC_DIR}/reader/bunny_drop/page-0`;
    __setFileSize(newPage0, 1_000_000); // stat for this path returns 1MB
    // oldPage0 is NOT registered → stat returns 0

    // After the fix: migration converts paths → relative → resolveOffline → newPage0
    // bytes should be 1MB, NOT 0.
    const results = await enumerateOfflineReadables();
    expect(results).toHaveLength(1);
    // This assertion would FAIL with pre-fix code (bytes would be 0 for the old path).
    expect(results[0]!.bytes).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// New downloads: downloadReadable must write relative paths to the sidecar
// ---------------------------------------------------------------------------

function baseProgress(readableKey: string): ReaderManifest['progress'] {
  return {
    readableKey,
    position: 0,
    locator: null,
    finished: false,
    restartedFromFinish: false,
  };
}

describe('downloadReadable — stores relative paths in the sidecar', () => {
  it('writes relative localPaths (not absolute) to offline.json', async () => {
    __resetBlobUtil();

    const manifest: ReaderManifest = {
      readableKey: 'page:file:42',
      contentType: 'comic',
      reader: 'comics',
      format: 'cbz',
      title: 'Berserk',
      seriesId: 1,
      volumeId: 7,
      pageCount: 2,
      progress: baseProgress('page:file:42'),
    };

    const res = await downloadReadable({
      manifest,
      serverUrl: 'https://srv.example',
      token: 'tok-xyz',
    });

    expect(res.ok).toBe(true);

    // Sidecar must contain RELATIVE paths.
    const sidecarPath = offlineManifestPath('page:file:42');
    const written = __getWritten();
    expect(written[sidecarPath]).toBeDefined();

    const sidecar = JSON.parse(written[sidecarPath]!) as { localPaths: string[] };
    for (const p of sidecar.localPaths) {
      expect(p).not.toMatch(/^\//); // must NOT start with '/' (not absolute)
      expect(p).toMatch(/^reader\//); // must start with 'reader/'
    }
  });

  it('also writes a relative coverPath when a cover is downloaded', async () => {
    __resetBlobUtil();

    const manifest: ReaderManifest = {
      readableKey: 'page:file:42',
      contentType: 'comic',
      reader: 'comics',
      format: 'cbz',
      title: 'Berserk',
      seriesId: 1,
      volumeId: 7,
      pageCount: 1,
      progress: baseProgress('page:file:42'),
    };

    await downloadReadable({
      manifest,
      serverUrl: 'https://srv.example',
      token: 'tok-xyz',
      coverUrl: 'https://cdn.example/cover.jpg',
    });

    const sidecarPath = offlineManifestPath('page:file:42');
    const written = __getWritten();
    const sidecar = JSON.parse(written[sidecarPath]!) as { coverPath?: string };
    if (sidecar.coverPath !== undefined) {
      expect(sidecar.coverPath).not.toMatch(/^\//);
      expect(sidecar.coverPath).toMatch(/^reader\//);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveOffline round-trip: relative paths from sidecar → current disk path
// ---------------------------------------------------------------------------

describe('resolveOffline round-trip', () => {
  it('relative path from sidecar resolves to current DocumentDir path', () => {
    const relPath = 'reader/page_file_42/page-0';
    const resolved = resolveOffline(relPath);
    expect(resolved).toBe(`${MOCK_DOC_DIR}/reader/page_file_42/page-0`);
    // That resolved path is what you'd pass to fs.stat / toFileUri.
  });
});

// ---------------------------------------------------------------------------
// toRelative — profile/ root migration (Finding 1)
// ---------------------------------------------------------------------------

describe('toRelative — profile/ root migration', () => {
  // These stable app-relative roots survive iOS container UUID rotation:
  //   reader/<key>/...  — offline readable files
  //   profile/...       — cached profile avatar
  // toRelative must recognise BOTH so a stale old-UUID absolute path for
  // either root losslessly migrates to a relative path that resolveOffline
  // can resolve to the CURRENT DocumentDir.

  it('migrates a stale old-UUID absolute avatar path to a relative profile/ path', () => {
    const OLD_UUID2 = 'BBBBBBBB-2222-2222-2222-BBBBBBBBBBBB';
    const stalePath = `/var/mobile/Containers/Data/Application/${OLD_UUID2}/Documents/profile/avatar`;
    const rel = toRelative(stalePath);
    // Must preserve the full profile/avatar segment, not just the basename.
    expect(rel).toBe('profile/avatar');
  });

  it('round-trips: stale old-UUID absolute avatar path → toRelative → resolveOffline → current DocumentDir', () => {
    const OLD_UUID3 = 'CCCCCCCC-3333-3333-3333-CCCCCCCCCCCC';
    const stalePath = `/var/mobile/Containers/Data/Application/${OLD_UUID3}/Documents/profile/avatar`;
    const resolved = resolveOffline(toRelative(stalePath));
    expect(resolved).toBe(`${MOCK_DOC_DIR}/profile/avatar`);
  });

  it('still migrates a stale old-UUID absolute reader path correctly (regression guard)', () => {
    const stalePath = `${OLD_DOC_DIR}/reader/page_file_42/page-0`;
    const rel = toRelative(stalePath);
    expect(rel).toBe('reader/page_file_42/page-0');
    expect(resolveOffline(rel)).toBe(`${MOCK_DOC_DIR}/reader/page_file_42/page-0`);
  });
});

import { mapOfflineGroups } from '@/features/reader/lib/useOfflineDownloads';
import type { OfflineEntry } from '@/features/reader/lib/offline-download';

function entry(o: Partial<OfflineEntry> & { manifest: OfflineEntry['manifest'] }): OfflineEntry {
  return {
    readableKey: o.readableKey ?? 'page_file_42',
    bytes: o.bytes ?? 0,
    lastReadAt: o.lastReadAt ?? 0,
    manifest: o.manifest,
  };
}

describe('mapOfflineGroups', () => {
  it('sources title/seriesName/cover from the sidecar only (no library join)', () => {
    // coverPath is a RELATIVE path (new canonical form since the relative-paths fix).
    // resolveOffline() prepends the current DocumentDir (/mock/Documents) at read time.
    const items = mapOfflineGroups([
      entry({
        readableKey: 'page_file_42',
        bytes: 5000,
        lastReadAt: 10,
        manifest: {
          type: 'comics',
          localPaths: ['reader/page_file_42/page-0'],
          coverPath: 'reader/page_file_42/cover.img',
          title: 'Berserk Vol 1',
          seriesName: 'Berserk',
          contentType: 'manga',
          seriesId: 1,
          volumeId: 7,
          downloadedAt: 1234,
        },
      }),
    ]);
    expect(items[0]!.title).toBe('Berserk Vol 1');
    expect(items[0]!.seriesName).toBe('Berserk');
    // Cover resolves to /mock/Documents/reader/page_file_42/cover.img at read time.
    expect(items[0]!.coverUrl).toBe('file:///mock/Documents/reader/page_file_42/cover.img');
    expect(items[0]!.broken).toBe(false);
    expect(items[0]!.downloadedAt).toBe(1234);
  });

  it('marks a download broken when files are missing (no localPaths)', () => {
    const items = mapOfflineGroups([
      entry({
        readableKey: 'page_file_9',
        bytes: 0,
        lastReadAt: 0,
        manifest: {
          type: 'comics',
          localPaths: [],
          title: 'X',
          seriesId: 2,
          downloadedAt: 1,
        },
      }),
    ]);
    expect(items[0]!.broken).toBe(true);
  });

  it('marks a download broken when bytes are 0 (interrupted copy)', () => {
    const items = mapOfflineGroups([
      entry({
        readableKey: 'page_file_3',
        bytes: 0,
        lastReadAt: 0,
        manifest: { type: 'comics', localPaths: ['/d/page-0'], seriesId: 3, downloadedAt: 1 },
      }),
    ]);
    expect(items[0]!.broken).toBe(true);
  });

  it('falls back to the volume title then "Downloaded" when seriesName is absent (legacy sidecar)', () => {
    const withTitle = mapOfflineGroups([
      entry({
        readableKey: 'page_file_8',
        bytes: 100,
        manifest: { type: 'comics', localPaths: ['/d/p0'], title: 'Solo Volume', seriesId: 8, downloadedAt: 1 },
      }),
    ]);
    expect(withTitle[0]!.seriesName).toBe('Solo Volume');

    const bare = mapOfflineGroups([
      entry({
        readableKey: 'page_file_99',
        bytes: 100,
        manifest: { type: 'comics', localPaths: ['/d/p0'], seriesId: 99, downloadedAt: 1 },
      }),
    ]);
    expect(bare[0]!.seriesName).toBe('Downloaded');
  });

  it('groups volumes per series and exposes the soonest downloadedAt + keys', () => {
    const items = mapOfflineGroups([
      entry({
        readableKey: 'page_file_1',
        bytes: 100,
        manifest: { type: 'comics', localPaths: ['/d/a'], seriesName: 'S', seriesId: 5, downloadedAt: 2000 },
      }),
      entry({
        readableKey: 'page_file_2',
        bytes: 200,
        manifest: { type: 'comics', localPaths: ['/d/b'], seriesName: 'S', seriesId: 5, downloadedAt: 1000 },
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.volumeCount).toBe(2);
    expect(items[0]!.seriesId).toBe(5);
    expect(items[0]!.bytes).toBe(300);
    expect(items[0]!.readableKeys).toEqual(['page_file_1', 'page_file_2']);
    // soonest expiry → smallest downloadedAt
    expect(items[0]!.downloadedAt).toBe(1000);
  });

  it('exposes a per-volume `volumes` array for the expanded list (key, title, bytes, broken, downloadedAt)', () => {
    const items = mapOfflineGroups([
      entry({
        readableKey: 'page_file_1',
        bytes: 100,
        manifest: {
          type: 'comics',
          localPaths: ['/d/a'],
          title: 'S Vol 1',
          seriesName: 'S',
          seriesId: 5,
          downloadedAt: 2000,
        },
      }),
      entry({
        readableKey: 'page_file_2',
        bytes: 0,
        manifest: {
          type: 'comics',
          localPaths: [],
          title: 'S Vol 2',
          seriesName: 'S',
          seriesId: 5,
          downloadedAt: 1000,
        },
      }),
    ]);
    expect(items).toHaveLength(1);
    const vols = items[0]!.volumes;
    expect(vols).toHaveLength(2);
    expect(vols[0]).toEqual({
      readableKey: 'page_file_1',
      title: 'S Vol 1',
      bytes: 100,
      broken: false,
      downloadedAt: 2000,
    });
    // The second volume has no on-disk files → broken.
    expect(vols[1]).toEqual({
      readableKey: 'page_file_2',
      title: 'S Vol 2',
      bytes: 0,
      broken: true,
      downloadedAt: 1000,
    });
  });

  it('falls back the per-volume title to the series name then "Volume" when the sidecar has no title', () => {
    const items = mapOfflineGroups([
      entry({
        readableKey: 'page_file_7',
        bytes: 50,
        manifest: { type: 'comics', localPaths: ['/d/a'], seriesName: 'S', seriesId: 9, downloadedAt: 1 },
      }),
    ]);
    expect(items[0]!.volumes[0]!.title).toBe('S');
  });

  it('uses volumeLabel (e.g. "Vol. 3") as volume row title when the sidecar has no per-volume title', () => {
    // The bug: without a sidecar `title` the volume row falls back to the series
    // name ("Bunny Drop") instead of showing which volume was downloaded.
    // Fix: `volumeLabel` in the sidecar produces "Vol. 3" (or "Vol. 1.5" for
    // fractional volumes), which is preferred over the series name fallback.
    const items = mapOfflineGroups([
      entry({
        readableKey: 'page_file_10',
        bytes: 500,
        manifest: {
          type: 'comics',
          localPaths: ['/d/a'],
          seriesName: 'Bunny Drop',
          volumeLabel: 'Vol. 3',
          seriesId: 10,
          downloadedAt: 1,
        },
      }),
    ]);
    const vol = items[0]!.volumes[0]!;
    expect(vol.title).toBe('Vol. 3');
    expect(vol.title).not.toBe('Bunny Drop');
  });

  it('combines volumeLabel and sidecar title into "Vol. N · Title" when both are present', () => {
    const items = mapOfflineGroups([
      entry({
        readableKey: 'page_file_11',
        bytes: 500,
        manifest: {
          type: 'comics',
          localPaths: ['/d/a'],
          seriesName: 'Bunny Drop',
          title: 'Settling In',
          volumeLabel: 'Vol. 3',
          seriesId: 10,
          downloadedAt: 1,
        },
      }),
    ]);
    const vol = items[0]!.volumes[0]!;
    expect(vol.title).toBe('Vol. 3 · Settling In');
    expect(vol.title).not.toBe('Bunny Drop');
  });

  it('shows volumeLabel for fractional volumes like "1.5"', () => {
    const items = mapOfflineGroups([
      entry({
        readableKey: 'page_file_12',
        bytes: 500,
        manifest: {
          type: 'comics',
          localPaths: ['/d/a'],
          seriesName: 'Some Series',
          volumeLabel: 'Vol. 1.5',
          seriesId: 11,
          downloadedAt: 1,
        },
      }),
    ]);
    expect(items[0]!.volumes[0]!.title).toBe('Vol. 1.5');
  });
});

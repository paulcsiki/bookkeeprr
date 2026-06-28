import { renderHook } from '@testing-library/react-native';
import {
  restoreReadableKey,
  offlineReaderParams,
  useOfflineHomeItems,
  useOfflineLibrarySeries,
} from '@/features/system/offlineContent';
import type { OfflineItem } from '@/features/reader/lib/useOfflineDownloads';

// useOfflineDownloads is the single source the helpers derive from; mock it so
// the tests own the OfflineItem fixture shape.
const mockUseOfflineDownloads = jest.fn();
jest.mock('@/features/reader/lib/useOfflineDownloads', () => ({
  useOfflineDownloads: () => mockUseOfflineDownloads(),
}));

function offItem(o: Partial<OfflineItem> = {}): OfflineItem {
  return {
    readableKey: 'page_file_42',
    readableKeys: ['page_file_42'],
    volumeCount: 1,
    title: 'Berserk',
    seriesName: 'Berserk',
    contentType: 'manga',
    coverUrl: 'file:///doc/reader/page_file_42/cover.img',
    hue: 12,
    seriesId: 7,
    bytes: 1024,
    lastReadAt: 1000,
    downloadedAt: 1000,
    resolved: true,
    broken: false,
    volumes: [],
    ...o,
  };
}

beforeEach(() => mockUseOfflineDownloads.mockReset());

it('restoreReadableKey turns a safe-key dirname back into a parseable key', () => {
  expect(restoreReadableKey('page_file_42')).toBe('page:file:42');
  expect(restoreReadableKey('audio_vol_5')).toBe('audio:vol:5');
  // An already-restored key passes through unchanged.
  expect(restoreReadableKey('page:file:42')).toBe('page:file:42');
});

it('offlineReaderParams keys paged off fileId and audio off volumeId', () => {
  expect(offlineReaderParams('page_file_42')).toEqual({ fileId: '42' });
  expect(offlineReaderParams('audio_vol_5')).toEqual({ volumeId: '5' });
  // Accepts the original (un-safe) form too.
  expect(offlineReaderParams('page:file:9')).toEqual({ fileId: '9' });
});

it('useOfflineHomeItems sorts by lastReadAt desc, filters broken, caps at 12', async () => {
  const items = [
    offItem({ readableKey: 'a', lastReadAt: 10 }),
    offItem({ readableKey: 'b', lastReadAt: 30 }),
    offItem({ readableKey: 'c', lastReadAt: 20, broken: true }),
    ...Array.from({ length: 12 }, (_, i) =>
      offItem({ readableKey: `x${i}`, lastReadAt: 100 + i }),
    ),
  ];
  mockUseOfflineDownloads.mockReturnValue({ items });
  const { result } = await renderHook(() => useOfflineHomeItems());
  expect(result.current).toHaveLength(12); // capped
  expect(result.current[0]!.lastReadAt).toBe(111); // newest first
  expect(result.current.some((i) => i.broken)).toBe(false); // broken dropped
});

it('useOfflineLibrarySeries maps one row per OfflineItem, broken filtered', async () => {
  mockUseOfflineDownloads.mockReturnValue({
    items: [
      offItem({ readableKey: 'page_file_42', title: 'Berserk', volumeCount: 3, contentType: 'manga' }),
      offItem({ readableKey: 'audio_vol_5', title: 'Mistborn', volumeCount: 1, contentType: 'audio', broken: true }),
    ],
  });
  const { result } = await renderHook(() => useOfflineLibrarySeries());
  expect(result.current).toHaveLength(1);
  expect(result.current[0]).toMatchObject({
    title: 'Berserk',
    contentType: 'manga',
    volumeCount: 3,
  });
  expect(result.current[0]!.items[0]!.readableKey).toBe('page_file_42');
});

it('useOfflineLibrarySeries: two volumes of one series → ONE grouped row', async () => {
  // useOfflineDownloads pre-groups by seriesId, so two downloaded volumes of the
  // same series arrive as a single OfflineItem (volumeCount 2, two readableKeys).
  // Locks that the library mapping keeps them as one row (no per-file rows).
  mockUseOfflineDownloads.mockReturnValue({
    items: [
      offItem({
        readableKey: 'page_file_42',
        readableKeys: ['page_file_42', 'page_file_43'],
        volumeCount: 2,
        seriesId: 7,
        title: 'Berserk',
      }),
    ],
  });
  const { result } = await renderHook(() => useOfflineLibrarySeries());
  expect(result.current).toHaveLength(1);
  expect(result.current[0]).toMatchObject({ seriesId: 7, volumeCount: 2, title: 'Berserk' });
  expect(result.current[0]!.items[0]!.readableKeys).toEqual(['page_file_42', 'page_file_43']);
});

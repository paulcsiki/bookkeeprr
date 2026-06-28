// Shared derivations over the on-disk offline content (useOfflineDownloads) that
// the offline Home + Library surfaces consume. No new I/O — this is pure shaping
// of the OfflineItem[] the Downloads manager already enumerates. Centralizes the
// audio/page readableKey split previously duplicated in ContinueReadingRail and
// SeriesOverview.
import { useMemo } from 'react';
import { parseReadableKey } from '@/api/schemas';
import { useOfflineDownloads, type OfflineItem } from '@/features/reader/lib/useOfflineDownloads';
import type { ContentType } from '@/api/schemas';
import type { LibraryStackParamList } from '@/navigation/types';

/** Max cards in the Home Downloaded rail. */
export const HOME_RAIL_CAP = 12;

/**
 * Restore a safe-key dirname (`page_file_42`) back to the canonical readableKey
 * (`page:file:42`) that `parseReadableKey` accepts. Only the two known forms
 * exist, so the mapping is unambiguous. An already-canonical key passes through.
 */
export function restoreReadableKey(key: string): string {
  if (key.includes(':')) return key;
  const page = /^page_file_(\d+)$/.exec(key);
  if (page) return `page:file:${page[1]}`;
  const audio = /^audio_vol_(\d+)$/.exec(key);
  if (audio) return `audio:vol:${audio[1]}`;
  return key;
}

/**
 * Reader route params for an offline readable's key (safe-key or canonical):
 * paged readables open by `fileId`, audio volumes by `volumeId`. Mirrors the
 * logic formerly inlined in ContinueReadingRail / SeriesOverview.
 */
export function offlineReaderParams(readableKey: string): LibraryStackParamList['Reader'] {
  const parsed = parseReadableKey(restoreReadableKey(readableKey));
  return parsed.kind === 'audio'
    ? { volumeId: String(parsed.volumeId) }
    : { fileId: String(parsed.fileId) };
}

/** A downloaded series row for the offline Library surfaces. */
export interface OfflineSeriesRow {
  /** Stable row key (the group's representative offline readableKey). */
  readableKey: string;
  title: string;
  coverUrl: string | null;
  contentType: ContentType;
  hue: number;
  volumeCount: number;
  /** The series id for navigating to SeriesOverview (null for legacy entries). */
  seriesId: number | null;
  /** The underlying offline items (one per downloaded volume group). */
  items: OfflineItem[];
}

/** Openable offline items for the Home rail: newest first, broken dropped, capped. */
export function useOfflineHomeItems(): OfflineItem[] {
  const { items } = useOfflineDownloads();
  return useMemo(
    () =>
      items
        .filter((i) => !i.broken)
        .slice()
        .sort((a, b) => b.lastReadAt - a.lastReadAt)
        .slice(0, HOME_RAIL_CAP),
    [items],
  );
}

/** Downloaded series rows for the offline Library grid/list (broken dropped).
 *
 * Note: `useOfflineDownloads` already groups offline volumes by `seriesId`, so
 * each `OfflineItem` is one per-series group (with `volumeCount`/`readableKeys`
 * spanning every downloaded volume), NOT one per file. Two volumes of the same
 * series therefore arrive as a single item → a single row here; the 1:1 map
 * below is correct, no re-grouping needed. */
export function useOfflineLibrarySeries(): OfflineSeriesRow[] {
  const { items } = useOfflineDownloads();
  return useMemo(
    () =>
      items
        .filter((i) => !i.broken)
        .slice()
        .sort((a, b) => b.lastReadAt - a.lastReadAt)
        .map((it) => ({
          readableKey: it.readableKey,
          title: it.title,
          coverUrl: it.coverUrl,
          contentType: it.contentType,
          hue: it.hue,
          volumeCount: it.volumeCount,
          seriesId: it.seriesId,
          items: [it],
        })),
    [items],
  );
}

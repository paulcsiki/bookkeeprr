import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  enumerateOfflineReadables,
  removeOfflineReadable,
  safeKey,
  type OfflineEntry,
} from './offline-download';
import { toFileUri } from '@/state/readerDownloadsStore';
import { resolveOffline } from './offline-download';
import { useReaderDownloads, type DownloadMeta } from '@/state/readerDownloadsStore';
import type { ContentType } from '@/api/schemas';

export const KEY = ['offline-downloads'] as const;

export interface OfflineItem {
  /** Representative key (the group's first readable) — used for React keys and
   * selection. The full set for delete is `readableKeys`. */
  readableKey: string;
  /** Every offline readable in this group (safe-key dirnames). Deleting the row
   * removes all of them. */
  readableKeys: string[];
  /** Number of offline volumes in this group (1 for a single book). */
  volumeCount: number;
  title: string;
  /** Series display label, sourced from the sidecar (falls back to the volume
   * title, then "Downloaded" for legacy sidecars that predate the field). */
  seriesName: string;
  contentType: ContentType;
  coverUrl: string | null;
  hue: number;
  /** The series this group belongs to (null for legacy/standalone entries). */
  seriesId: number | null;
  bytes: number;
  lastReadAt: number;
  /** Epoch ms of the group's SOONEST download (min across volumes) — drives the
   * 30-day TTL countdown so the row shows the nearest expiry. */
  downloadedAt: number;
  /** Whether the sidecar (or legacy store meta) carried a real title; false →
   * 'Unknown title' fallback. */
  resolved: boolean;
  /**
   * True when the on-disk copy is genuinely missing — no `localPaths` were
   * recorded, or the files sum to 0 bytes (an interrupted/failed copy). A
   * complete download with real bytes on disk is NEVER broken, so the row never
   * falsely shows "incomplete — re-download". A group is broken only when EVERY
   * volume is broken.
   */
  broken: boolean;
  /**
   * The individual offline volumes in this group, in disk-scan order. Drives the
   * expanded per-volume list in the Downloads manager: each row shows the volume
   * title, on-disk size, its own time-left countdown, and per-volume actions.
   * For a single-volume/standalone item this has exactly one entry.
   */
  volumes: OfflineVolume[];
}

/** One offline volume inside a series group, for the expanded volume list. */
export interface OfflineVolume {
  /** Safe-key dirname for this volume — removeMany([readableKey]) deletes it. */
  readableKey: string;
  /** Volume display title (sidecar title → series name → "Volume"). */
  title: string;
  /** On-disk byte total for this volume. */
  bytes: number;
  /** Whether this single volume's on-disk files are missing/empty. */
  broken: boolean;
  /** Epoch ms this volume was downloaded — drives its own TTL countdown. */
  downloadedAt: number;
}

const HUE_FOR_TYPE: Record<ContentType, number> = {
  manga: 12,
  comic: 60,
  novel: 220,
  ebook: 150,
  audio: 300,
};

/** A single offline volume is broken when its on-disk files are genuinely
 * missing — no recorded localPaths, or a 0-byte (failed/interrupted) copy. */
function volumeBroken(entry: OfflineEntry): boolean {
  return entry.manifest.localPaths.length === 0 || entry.bytes <= 0;
}

/**
 * Map enumerated offline entries to the per-series `OfflineItem` rows the
 * Downloads manager renders. Pure (no hooks, no library join): every display
 * field — title, seriesName, content type, cover — comes from the SIDECAR, so
 * the list renders correctly OFFLINE without a live library query. The store
 * `meta` (legacy entries from before the sidecar carried these fields) is a
 * secondary fallback for title/type/cover only; it has no on-disk cover.
 */
export function mapOfflineGroups(
  entries: OfflineEntry[],
  metaBySafeKey: Map<
    string,
    { title?: string; seriesName?: string; contentType?: ContentType; coverUrl?: string | null }
  > = new Map(),
): OfflineItem[] {
  // Group offline volumes by series so the list shows one row per series
  // (cover + N volumes). Entries with no seriesId (legacy/standalone) each form
  // their own single-volume group.
  const groups = new Map<string, OfflineEntry[]>();
  for (const entry of entries) {
    const sid = entry.manifest.seriesId;
    const gkey = sid != null ? `series:${sid}` : `key:${entry.readableKey}`;
    const arr = groups.get(gkey) ?? [];
    arr.push(entry);
    groups.set(gkey, arr);
  }

  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const sidecar = first.manifest;
    const seriesId = sidecar.seriesId;
    const meta = metaBySafeKey.get(first.readableKey);

    const sidecarTitle = sidecar.title && sidecar.title.length > 0 ? sidecar.title : undefined;
    const metaTitle = meta?.title && meta.title.length > 0 ? meta.title : undefined;
    const title = sidecarTitle ?? metaTitle ?? 'Unknown title';
    const resolved = sidecarTitle !== undefined || metaTitle !== undefined;

    // Series label from the sidecar; fall back to the volume title, then a
    // generic "Downloaded" for legacy sidecars that carry neither.
    const seriesName =
      (sidecar.seriesName && sidecar.seriesName.length > 0 ? sidecar.seriesName : undefined) ??
      (meta?.seriesName && meta.seriesName.length > 0 ? meta.seriesName : undefined) ??
      sidecarTitle ??
      metaTitle ??
      'Downloaded';

    const ct: ContentType =
      (sidecar.contentType as ContentType | undefined) ??
      meta?.contentType ??
      (sidecar.type === 'audio' ? 'audio' : 'manga');

    // Prefer the on-disk cover (file://) so art renders offline; otherwise the
    // captured remote URL (online only). No library join.
    // resolveOffline() handles both relative (new) and legacy absolute paths.
    const coverUrl = sidecar.coverPath
      ? toFileUri(resolveOffline(sidecar.coverPath))
      : (sidecar.coverUrl ?? meta?.coverUrl ?? null);

    const bytes = group.reduce((s, e) => s + e.bytes, 0);
    const lastReadAt = Math.max(0, ...group.map((e) => e.lastReadAt));
    // Soonest expiry → smallest downloadedAt across the group's volumes.
    const downloadedAt = Math.min(
      ...group.map((e) => e.manifest.downloadedAt ?? 0),
    );
    // A group is broken only when EVERY volume is missing its files on disk.
    const broken = group.every(volumeBroken);

    // Per-volume rows for the expanded list. Each volume's own sidecar carries
    // its title and/or volumeLabel; combine them to show the volume identifier
    // (e.g. "Vol. 3 · Settling In" or just "Vol. 3") rather than repeating the
    // series name. Fall back to seriesName, then "Volume" for legacy sidecars.
    const volumes: OfflineVolume[] = group.map((e) => {
      const vt = e.manifest.title && e.manifest.title.length > 0 ? e.manifest.title : undefined;
      const vl =
        e.manifest.volumeLabel && e.manifest.volumeLabel.length > 0
          ? e.manifest.volumeLabel
          : undefined;
      // Compose display label: prefer "Vol. N · Title" > "Vol. N" > title > seriesName > "Volume"
      const displayTitle =
        vl && vt
          ? `${vl} · ${vt}`
          : vl ?? vt ?? seriesName ?? 'Volume';
      return {
        readableKey: e.readableKey,
        title: displayTitle,
        bytes: e.bytes,
        broken: volumeBroken(e),
        downloadedAt: e.manifest.downloadedAt ?? 0,
      };
    });

    return {
      readableKey: first.readableKey,
      readableKeys: group.map((e) => e.readableKey),
      volumeCount: group.length,
      title,
      seriesName,
      contentType: ct,
      coverUrl,
      hue: HUE_FOR_TYPE[ct],
      seriesId: seriesId ?? null,
      bytes,
      lastReadAt,
      downloadedAt,
      resolved,
      broken,
      volumes,
    };
  });
}

export function useOfflineDownloads(): {
  items: OfflineItem[];
  totalBytes: number;
  byType: Record<ContentType, number>;
  isLoading: boolean;
  refetch: () => void;
  removeOne: (readableKey: string) => Promise<void>;
  removeMany: (readableKeys: string[]) => Promise<void>;
} {
  const qc = useQueryClient();
  // The download store holds the title/contentType/coverUrl captured at enqueue
  // time. Keyed by the ORIGINAL readableKey; offline entries are keyed by the
  // safe-key dirname, so index the store by safeKey for a direct lookup. This is
  // a LEGACY fallback only — modern sidecars carry all display fields, so the
  // list renders fully offline without it.
  const storeDownloads = useReaderDownloads((s) => s.downloads);

  const query = useQuery({
    queryKey: KEY,
    queryFn: enumerateOfflineReadables,
    staleTime: 30_000,
  });

  const removal = useMutation({
    mutationFn: async (keys: string[]) => {
      for (const k of keys) {
        await removeOfflineReadable(k);
        // Also clear the persisted download-store entry. Offline dirs are keyed
        // by safe-key, the store by the original readableKey — without this a
        // deleted copy left a stale `done` entry whose localPaths pointed at
        // now-gone files, and the reader served those dead paths (black pages)
        // instead of streaming.
        useReaderDownloads.getState().removeBySafeKey(k);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  // Index the persisted download metadata by safe-key so each offline entry
  // (keyed by its safe-key dirname) can recover the title/type/cover it was
  // downloaded with, even when it isn't in the current library page.
  const metaBySafeKey = new Map<string, DownloadMeta>();
  for (const [readableKey, entry] of Object.entries(storeDownloads)) {
    metaBySafeKey.set(safeKey(readableKey), entry);
  }

  const offline = query.data ?? [];

  // Display fields come from the sidecar (mapOfflineGroups); the store meta is a
  // legacy-only fallback for entries downloaded before the sidecar carried
  // title/type/cover. No live library join — the list renders fully OFFLINE.
  const items: OfflineItem[] = mapOfflineGroups(offline, metaBySafeKey);

  const totalBytes = items.reduce((s, it) => s + it.bytes, 0);
  const byType: Record<ContentType, number> = {
    manga: 0, comic: 0, novel: 0, ebook: 0, audio: 0,
  };
  for (const it of items) byType[it.contentType] += it.bytes;

  return {
    items,
    totalBytes,
    byType,
    // Loading tracks the on-disk scan only — the library query is best-effort
    // title enrichment (titles fall back to the sidecar/meta). Waiting on the
    // network here made the screen render its populated chrome first and then
    // flip to the empty state once the library resolved.
    isLoading: query.isLoading,
    refetch: () => qc.invalidateQueries({ queryKey: KEY }),
    removeOne: (k) => removal.mutateAsync([k]),
    removeMany: (keys) => removal.mutateAsync(keys),
  };
}

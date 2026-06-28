// Per-readable offline-download state, tracked in a zustand store and persisted
// to AsyncStorage so the "downloaded" badge survives cold starts.
//
// The store records *download intent + progress* keyed by `readableKey`
// (`page:file:<id>` / `audio:vol:<id>`). The state-transition logic lives in the
// pure `reduce*` helpers below so it's unit-testable without the store/storage;
// the store is a thin wrapper that applies a reducer and persists the result.
//
// The actual byte download is performed by
// `features/reader/lib/offline-download.ts` (backed by react-native-blob-util);
// this store records the download STATE + the resolved on-device paths so the
// reader can resolve a local copy and the UI can show progress / an OFFLINE
// badge. The exported `downloadReadable` action orchestrates: enqueue → fetch
// the manifest → download files (reporting progress) → complete/fail.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, type AppStateStatus } from 'react-native';
import { create } from 'zustand';
import { createApiClient } from '@/api/client';
import { ReaderManifest, parseReadableKey } from '@/api/schemas';
import type { ContentType } from '@/api/schemas';
import {
  downloadReadable as downloadFiles,
  deleteOfflineReadable,
  enumerateOfflineReadables,
  wipeExpiredOfflineReadables,
  freeDiskFraction,
  networkAllowsDownload,
  safeKey,
} from '@/features/reader/lib/offline-download';
import { loadOfflineSettings } from '@/features/reader/lib/offline-settings';

/** Refuse a download when free storage is below this fraction of the disk. */
const MIN_FREE_DISK_FRACTION = 0.1;

/** How many times to (re)try an interrupted download before wiping it. */
const DOWNLOAD_MAX_ATTEMPTS = 3;

export const DOWNLOADS_STORAGE_KEY = 'reader/downloads/v1';

export type DownloadState = 'queued' | 'downloading' | 'paused' | 'done' | 'error';

/** Optional descriptive metadata captured at enqueue time (for list UIs). */
export interface DownloadMeta {
  title?: string;
  /** Mobile content-type (manga/comic/novel/ebook/audio) for the row pill. */
  contentType?: ContentType;
  /** Series display name, so the Downloads list groups + labels without a library join. */
  seriesName?: string;
  /** Cover art URL, so the Downloads row renders without a library join. */
  coverUrl?: string | null;
  /** Volume identifier label (e.g. "Vol. 3"), so the Downloads list can show
   * which volume is downloaded instead of repeating the series name. */
  volumeLabel?: string;
}

export interface DownloadEntry extends DownloadMeta {
  state: DownloadState;
  /** 0..100 percent complete. */
  pct: number;
  /** Bytes written so far. */
  bytes: number;
  /**
   * Filesystem path once `complete`; undefined until then. For multi-file
   * readables (comics pages / audio tracks) this is the FIRST path — the full
   * list is in `localPaths`. Kept for backward compatibility with prior callers.
   */
  localPath?: string;
  /** All on-device file paths once `complete` (pages / tracks / the pdf). */
  localPaths?: string[];
}

export type DownloadMap = Record<string, DownloadEntry>;

// ---------------------------------------------------------------------------
// Pure reducers — these never touch the store or AsyncStorage so they can be
// unit-tested directly. Each returns a NEW map (the prior map is untouched).
// ---------------------------------------------------------------------------

/** Seed a fresh `queued` entry (overwriting any prior entry for the key). */
export function reduceEnqueue(map: DownloadMap, key: string, meta: DownloadMeta): DownloadMap {
  return { ...map, [key]: { state: 'queued', pct: 0, bytes: 0, ...meta } };
}

/** Record progress; flips a `queued` entry to `downloading`. No-op if unknown. */
export function reduceProgress(
  map: DownloadMap,
  key: string,
  pct: number,
  bytes: number,
): DownloadMap {
  const prev = map[key];
  if (!prev) return map;
  return { ...map, [key]: { ...prev, state: 'downloading', pct, bytes } };
}

/**
 * Mark a download complete at 100% with its on-device paths. No-op if unknown.
 * Accepts either a single path or a list; `localPath` is set to the first.
 */
export function reduceComplete(
  map: DownloadMap,
  key: string,
  localPaths: string | string[],
): DownloadMap {
  const prev = map[key];
  if (!prev) return map;
  const paths = Array.isArray(localPaths) ? localPaths : [localPaths];
  const first = paths[0];
  return {
    ...map,
    [key]: {
      ...prev,
      state: 'done',
      pct: 100,
      localPaths: paths,
      ...(first !== undefined ? { localPath: first } : {}),
    },
  };
}

/** Mark a download errored, preserving its last-known pct/bytes. No-op if unknown. */
export function reduceFail(map: DownloadMap, key: string): DownloadMap {
  const prev = map[key];
  if (!prev) return map;
  return { ...map, [key]: { ...prev, state: 'error' } };
}

/** Mark a download paused (resumable), preserving its last pct/bytes. No-op if unknown. */
export function reducePause(map: DownloadMap, key: string): DownloadMap {
  const prev = map[key];
  if (!prev) return map;
  return { ...map, [key]: { ...prev, state: 'paused' } };
}

/** Drop a key from the map entirely. */
export function reduceRemove(map: DownloadMap, key: string): DownloadMap {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

/**
 * Drop every entry whose readableKey maps to the given safe-key dirname.
 * Offline files live under `<DocumentDir>/reader/<safeKey>` and the Downloads
 * manager deletes by that dirname, but the store is keyed by the ORIGINAL
 * readableKey. Without this, deleting an offline copy left a stale `done` entry
 * whose `localPaths` pointed at now-deleted files — the reader then served those
 * dead `file://` paths (black pages) instead of streaming. No-op when nothing
 * matches.
 */
export function reduceRemoveBySafeKey(map: DownloadMap, safeDir: string): DownloadMap {
  let changed = false;
  const next: DownloadMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (safeKey(k) === safeDir) {
      changed = true;
      continue;
    }
    next[k] = v;
  }
  return changed ? next : map;
}

// ---------------------------------------------------------------------------
// Persistence (hydrate on init, persist on every change).
// ---------------------------------------------------------------------------

/** Parse a persisted blob into a `DownloadMap`; `{}` for empty/corrupted. */
function parseStored(raw: string | null): DownloadMap {
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as DownloadMap) : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Store.
// ---------------------------------------------------------------------------

interface ReaderDownloadsState {
  downloads: DownloadMap;
  enqueue: (key: string, meta: DownloadMeta) => void;
  setProgress: (key: string, pct: number, bytes: number) => void;
  complete: (key: string, localPaths: string | string[]) => void;
  fail: (key: string) => void;
  pause: (key: string) => void;
  remove: (key: string) => void;
  /** Remove any entry whose readableKey maps to the given safe-key dirname. */
  removeBySafeKey: (safeDir: string) => void;
  getDownload: (key: string) => DownloadEntry | undefined;
}

export const useReaderDownloads = create<ReaderDownloadsState>((set, get) => ({
  downloads: {},
  enqueue: (key, meta) => set((s) => ({ downloads: reduceEnqueue(s.downloads, key, meta) })),
  setProgress: (key, pct, bytes) =>
    set((s) => ({ downloads: reduceProgress(s.downloads, key, pct, bytes) })),
  complete: (key, localPaths) =>
    set((s) => ({ downloads: reduceComplete(s.downloads, key, localPaths) })),
  fail: (key) => set((s) => ({ downloads: reduceFail(s.downloads, key) })),
  pause: (key) => set((s) => ({ downloads: reducePause(s.downloads, key) })),
  remove: (key) => set((s) => ({ downloads: reduceRemove(s.downloads, key) })),
  removeBySafeKey: (safeDir) =>
    set((s) => ({ downloads: reduceRemoveBySafeKey(s.downloads, safeDir) })),
  getDownload: (key) => get().downloads[key],
}));

/**
 * Reader-side selector: the completed offline file paths for a readable, or
 * `null` when there's no finished download. Subscribed to the store so a reader
 * re-renders to its local copy the instant a download completes. The reader
 * indexes into `localPaths` (comics page n / audio track idx / the pdf at [0])
 * and prefixes `file://` to load from disk instead of the network.
 */
export function useOfflineSource(readableKey: string): string[] | null {
  return useReaderDownloads((s) => {
    const entry = s.downloads[readableKey];
    if (!entry || entry.state !== 'done') return null;
    return entry.localPaths && entry.localPaths.length > 0 ? entry.localPaths : null;
  });
}

/** Normalize a stored device path to a `file://` URI (idempotent). */
export function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

// Persist on every change. Fire-and-forget; download state is advisory.
useReaderDownloads.subscribe((s) => {
  void AsyncStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(s.downloads));
});

/**
 * Resolves once the persisted download map has been read back from AsyncStorage.
 * Callers that need to act on the restored state (e.g. reconciling against disk
 * on startup) await this so they don't race the hydration.
 */
let markHydrated!: () => void;
export const downloadsHydrated = new Promise<void>((resolve) => {
  markHydrated = resolve;
});

/**
 * Drop `done` entries whose on-disk offline directory no longer exists. An entry
 * can outlive its files when a copy was deleted by an older build (which removed
 * files but not the store entry), by the OS under storage pressure, or by a
 * sideways reinstall. Without this, the library/Continue-Reading rail shows an
 * OFFLINE badge for a copy the Downloads manager (which scans disk) reports as
 * gone — the two views disagree. Run on startup after hydration.
 */
export async function reconcileDownloadsWithDisk(): Promise<void> {
  let onDisk: Set<string>;
  try {
    const entries = await enumerateOfflineReadables();
    onDisk = new Set(entries.map((e) => e.readableKey)); // dir names = safe-keys
  } catch {
    return; // can't read disk — leave the store untouched
  }
  const map = useReaderDownloads.getState().downloads;
  for (const key of Object.keys(map)) {
    if (map[key]?.state === 'done' && !onDisk.has(safeKey(key))) {
      useReaderDownloads.getState().remove(key);
    }
  }
}

/**
 * Delete offline content older than the 30-day TTL and clear the matching store
 * entries. Called on app startup and on foreground-resume. Best-effort.
 */
export async function expireOldDownloads(): Promise<number> {
  let removed: string[];
  try {
    removed = await wipeExpiredOfflineReadables();
  } catch {
    return 0;
  }
  for (const safeDir of removed) {
    useReaderDownloads.getState().removeBySafeKey(safeDir);
  }
  return removed.length;
}

// Hydrate from AsyncStorage on module init.
void AsyncStorage.getItem(DOWNLOADS_STORAGE_KEY)
  .then((raw) => {
    const stored = parseStored(raw);
    if (Object.keys(stored).length > 0) {
      useReaderDownloads.setState({ downloads: stored });
    }
  })
  .finally(() => markHydrated());

/** What the caller passes alongside the readableKey to drive a real download. */
export interface DownloadOptions extends DownloadMeta {
  /** Backend base URL (from the auth creds). */
  serverUrl: string;
  /** Session bearer (from the auth creds). */
  token: string;
}

export type DownloadActionResult = { ok: true } | { ok: false; reason: string };

/**
 * Keys with an in-flight `downloadReadable` orchestration. Used to prevent a
 * foreground resume (`resumeInterruptedDownloads`) from double-starting a
 * download that is already running for the same readable. Module-level because
 * the orchestration is module-scoped (not stored), and a resume can be triggered
 * concurrently with an in-progress user-initiated download.
 */
const inFlight = new Set<string>();

/**
 * Per-key cancel functions for the CURRENTLY in-flight native transfer. An
 * orchestration registers its current rnbu task's `.cancel()` here (keyed by
 * `readableKey`) while a file is downloading, and clears it when the fetch
 * settles. `pauseInFlightForBackground()` reads this to proactively stop a
 * running transfer on app background — otherwise iOS suspends the NSURLSession
 * and RESTARTS it from 0 on foreground (the bug this fixes). The partial bytes
 * stay on disk (rnbu writes directly to the target path), so the foreground
 * resume continues via HTTP Range instead of starting over.
 */
const cancelHandlers = new Map<string, () => void>();

/**
 * Keys we deliberately cancelled for app-background. A cancel rejects the
 * in-flight fetch, which `runDownload`'s catch would otherwise treat as a
 * transient blip and RETRY (2 more attempts) while the app is suspended. This
 * flag tells `runDownload` to stop retrying immediately and settle as `paused`,
 * keeping the partial for the foreground Range-resume. Cleared once consumed.
 */
const backgroundCancelled = new Set<string>();

/**
 * Whether an `AppState` transition should cancel in-flight downloads.
 *
 * Leaving the foreground (`'background'`/`'inactive'`) cancels + pauses the
 * transfer so a foreground task can't be silently restarted from 0 by iOS —
 * BUT only off iOS. On iOS the download uses a background NSURLSession
 * (`rnbuDownloadConfig`) that the OS carries across suspension, so cancelling
 * it would defeat the whole point. Pure so it's unit-testable.
 */
export function shouldCancelInFlightOnAppState(status: AppStateStatus): boolean {
  if (Platform.OS === 'ios') return false;
  return status === 'background' || status === 'inactive';
}

/**
 * Download a readable's files to device storage, tracking progress in the store.
 *
 * Orchestration: enqueue (`queued`) → fetch the reader manifest for this
 * readable (the rail only has the `readableKey`) → run the real file download
 * (`features/reader/lib/offline-download`), forwarding aggregate progress to the
 * store (`downloading`) → mark `done` with the resolved `localPaths`, or `error`
 * on any failure (manifest fetch, unsupported format, or download IO).
 *
 * EPUB is not supported offline yet — the downloader returns
 * `{ ok:false, reason:'epub-offline-unsupported' }`, which surfaces here as an
 * `error` entry (and this result).
 */
export async function downloadReadable(
  key: string,
  opts: DownloadOptions,
): Promise<DownloadActionResult> {
  // A resume (or a re-tap) must not double-start a download already running for
  // this readable — that would race two writers onto the same on-disk files.
  if (inFlight.has(key)) return { ok: false, reason: 'in-flight' };
  inFlight.add(key);
  // Clear any stale background-cancel flag from a prior run before starting.
  backgroundCancelled.delete(key);
  try {
    return await runDownload(key, opts);
  } finally {
    inFlight.delete(key);
    cancelHandlers.delete(key);
    backgroundCancelled.delete(key);
  }
}

async function runDownload(
  key: string,
  opts: DownloadOptions,
): Promise<DownloadActionResult> {
  const store = useReaderDownloads.getState();
  const { serverUrl, token, ...meta } = opts;
  store.enqueue(key, meta);

  // Honor "download on Wi-Fi only": refuse on a confirmed cellular connection.
  const settings = await loadOfflineSettings();
  if (!(await networkAllowsDownload(settings.wifiOnly))) {
    store.fail(key);
    return { ok: false, reason: 'wifi-required' };
  }

  // Refuse when storage is critically low (< 10% free) so a download can't fill
  // the device. A null reading (can't determine) is treated as OK.
  const freeFrac = await freeDiskFraction();
  if (freeFrac != null && freeFrac < MIN_FREE_DISK_FRACTION) {
    store.fail(key);
    return { ok: false, reason: 'insufficient-storage' };
  }

  // Retry an interrupted download a few times (network blip / partial transfer).
  // On TERMINAL failure (`epub-offline-unsupported`, `unsupported-readable`) wipe
  // the partial immediately — a re-download would just fail the same way. On
  // TRANSIENT exhaustion, PAUSE and KEEP the partial on disk so the byte-range
  // resume (resumableFetchFile) can pick up where it left off; never wipe a
  // transient failure.
  const client = createApiClient({
    serverUrl,
    token,
    refreshToken: '',
    expiresAt: '',
    certFingerprint: null,
  });
  const parsed = parseReadableKey(key);
  const qs = parsed.kind === 'audio' ? `volumeId=${parsed.volumeId}` : `fileId=${parsed.fileId}`;

  let lastReason = 'download-failed';
  let terminal = false;
  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await client.get(`/api/reader/manifest?${qs}`);
      const manifest = ReaderManifest.parse(raw);
      const res = await downloadFiles({
        manifest, serverUrl, token,
        coverUrl: meta.coverUrl ?? null,
        ...(meta.title !== undefined ? { title: meta.title } : {}),
        ...(meta.contentType !== undefined ? { contentType: meta.contentType } : {}),
        ...(meta.seriesName !== undefined ? { seriesName: meta.seriesName } : {}),
        onProgress: (pct, bytes) => useReaderDownloads.getState().setProgress(key, pct, bytes),
        // Register the current native task's cancel so a background event can
        // stop the transfer (the partial stays on disk for the Range-resume).
        onTask: (cancel) => cancelHandlers.set(key, cancel),
      });
      if (res.ok) {
        useReaderDownloads.getState().complete(key, res.localPaths);
        return { ok: true };
      }
      lastReason = res.reason;
      // Terminal reasons: not worth retrying or keeping a partial for.
      if (res.reason === 'epub-offline-unsupported' || res.reason === 'unsupported-readable') {
        terminal = true;
        break;
      }
    } catch {
      lastReason = 'download-failed';
    }
    // A deliberate background-cancel is transient but must NOT retry while the
    // app is suspended — stop now and settle as `paused`, keeping the partial.
    if (backgroundCancelled.has(key)) break;
    if (attempt < DOWNLOAD_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }

  if (terminal) {
    // Wipe the partial + entry — a re-download would just fail again.
    await deleteOfflineReadable(key);
    useReaderDownloads.getState().remove(key);
    return { ok: false, reason: lastReason };
  }
  // Transient: KEEP the partial on disk and PAUSE so a trigger resumes it
  // (byte-resume continues from the on-disk offset). Never wipe here.
  useReaderDownloads.getState().pause(key);
  return { ok: false, reason: lastReason };
}

/**
 * Restart any download left interrupted by a background/suspend.
 *
 * A download orchestrated by `downloadReadable` is in-memory JS — when the app
 * is backgrounded mid-transfer the native fetch is suspended, and an entry can
 * be left at `queued`/`downloading`/`paused` with no live orchestration to
 * finish it. The triggers wired in `App.tsx` (cold start, foreground, and an
 * offline→online transition) call this to re-run `downloadReadable` for every
 * such entry NOT already in-flight, reusing the entry's stored meta. Each file
 * RESUMES from its on-disk byte offset via `resumableFetchFile` (HTTP Range) —
 * complete files are skipped, a partial continues where it left off.
 *
 * Best-effort: each key is attempted independently, errors are swallowed, and
 * this never throws. Runs sequentially to avoid hammering the server with a
 * burst of concurrent transfers on foreground.
 */
export async function resumeInterruptedDownloads(creds: {
  serverUrl: string;
  token: string;
}): Promise<void> {
  const map = useReaderDownloads.getState().downloads;
  const stuck = Object.entries(map).filter(
    ([key, e]) =>
      (e.state === 'queued' || e.state === 'downloading' || e.state === 'paused') &&
      !inFlight.has(key),
  );
  for (const [key, entry] of stuck) {
    try {
      await downloadReadable(key, {
        serverUrl: creds.serverUrl,
        token: creds.token,
        ...(entry.title !== undefined ? { title: entry.title } : {}),
        ...(entry.contentType !== undefined ? { contentType: entry.contentType } : {}),
        ...(entry.seriesName !== undefined ? { seriesName: entry.seriesName } : {}),
        ...(entry.coverUrl !== undefined ? { coverUrl: entry.coverUrl } : {}),
        ...(entry.volumeLabel !== undefined ? { volumeLabel: entry.volumeLabel } : {}),
      });
    } catch {
      /* best-effort per key — never let one stuck download block the rest */
    }
  }
}

/**
 * Proactively stop every in-flight download because the app is going to the
 * BACKGROUND, and mark each `paused`.
 *
 * Why this exists: when a transfer is actively RUNNING and iOS suspends the app,
 * the native NSURLSession is suspended and — on foreground — RESTARTS the
 * transfer from byte 0. Because the entry is still `inFlight`,
 * `resumeInterruptedDownloads` skips it, so the user sees a download that was at
 * 20% start over. To prevent that, we cancel the native task here (rnbu writes
 * directly to the target path, so the PARTIAL bytes remain on disk) and mark the
 * entry `paused`. The subsequent foreground/online trigger then runs
 * `resumeInterruptedDownloads`, which Range-resumes from the on-disk offset
 * (`resumableFetchFile`) instead of restarting.
 *
 * The cancel rejects the in-flight `downloadReadable`, whose `finally` clears
 * `inFlight`; the `backgroundCancelled` flag stops its retry loop so it settles
 * as `paused` (a background-cancel is transient, never `error`). We also pause
 * the entry directly here so it ends `paused` even if the orchestration's own
 * pause races. Best-effort — never throws.
 */
export function pauseInFlightForBackground(): void {
  for (const key of Array.from(inFlight)) {
    // Mark so the orchestration's retry loop stops and settles as `paused`.
    backgroundCancelled.add(key);
    // Pause the entry now (transient, not an error) — keeps pct/bytes + partial.
    try {
      useReaderDownloads.getState().pause(key);
    } catch {
      /* best-effort */
    }
    // Cancel the live native task; its rejection unwinds the orchestration.
    const cancel = cancelHandlers.get(key);
    if (cancel) {
      try {
        cancel();
      } catch {
        /* already settled — nothing to cancel */
      }
    }
  }
}

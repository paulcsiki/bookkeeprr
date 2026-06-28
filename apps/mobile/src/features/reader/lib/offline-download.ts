// Real offline download of a readable's constituent files to device storage.
//
// The serving routes expose EXTRACTED artifacts, not the raw archives, so we
// download exactly what the readers load at runtime:
//   - comics:    each rendered page image (`/api/reader/comics/<fileId>/page/<n>`)
//   - pdf:       the whole file (`/api/reader/pdf/<fileId>`)
//   - mobi/azw3: the whole file (`/api/reader/ebook/<fileId>/download`) — foliate
//               renders it client-side from the raw bytes, exactly like pdf.
//   - audio:     each track file (`/api/reader/audio/<fileId>`)
//   - epub:      DEFERRED — per-resource extraction (spine/CSS/fonts/images) is
//               complex and not yet supported offline; `downloadReadable` returns
//               `{ ok:false, reason:'epub-offline-unsupported' }`.
//
// Every request carries the session bearer. Files land under
// `<DocumentDir>/reader/<safe-readableKey>/…`. A small per-readable JSON
// (`offline.json`) records the type + localPaths so the reader can resolve the
// offline copy on a later cold start.
//
// `react-native-blob-util` is the file-I/O backend (a native module); it is
// MOCKED in jest (`tests/mocks/blob-util.ts`). The orchestration here is the
// unit-tested surface — the actual bytes-to-disk is device/CI-verified.

import ReactNativeBlobUtil, { type ReactNativeBlobUtilConfig } from 'react-native-blob-util';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { parseReadableKey, type ReaderManifest } from '@/api/schemas';

const fs = ReactNativeBlobUtil.fs;

/** Root under DocumentDir where offline readables live. */
function offlineRoot(): string {
  return `${fs.dirs.DocumentDir}/reader`;
}

// ---------------------------------------------------------------------------
// Container-independent path helpers
//
// iOS app-data containers change their UUID on every app install/update.
// A path stored as `/var/mobile/Containers/.../OLD-UUID/Documents/reader/...`
// becomes invalid after an update. Storing RELATIVE paths (relative to
// fs.dirs.DocumentDir, e.g. `reader/<key>/page-0`) and resolving them at
// read time against the CURRENT DocumentDir makes downloads survive updates.
//
// OfflineManifest.localPaths and .coverPath store relative paths from this
// point forward. Legacy sidecars (absolute paths) are migrated on first read.
// ---------------------------------------------------------------------------

/**
 * Stable app-relative subtrees that survive iOS container UUID rotation.
 * When an absolute path contains one of these as a segment, everything from
 * the marker onward is the container-independent relative path.
 *
 *   reader/<key>/...  — offline readable files (comics, pdf, audio, ebook)
 *   profile/...       — cached profile avatar
 */
const KNOWN_RELATIVE_ROOTS = ['reader/', 'profile/'] as const;

/**
 * Convert an absolute file path to one relative to the current DocumentDir.
 * If the path is already relative (doesn't start with '/'), it is returned
 * as-is. Robust to path changes caused by iOS container UUID rotation:
 * any known stable root (`reader/` or `profile/`) is found in the path and
 * everything from that root onward is kept, regardless of the UUID prefix.
 */
export function toRelative(absPath: string): string {
  if (!absPath.startsWith('/')) return absPath; // already relative
  // Fast path: strip current DocumentDir prefix.
  const docDir = fs.dirs.DocumentDir;
  const prefix = docDir.endsWith('/') ? docDir : `${docDir}/`;
  if (absPath.startsWith(prefix)) return absPath.slice(prefix.length);
  // Fallback for OLD container UUID: find the earliest occurrence of any
  // known stable root marker and keep everything from that root onward.
  // This makes `reader/<key>/...` AND `profile/...` losslessly migrate even
  // after an iOS install that rotated the app-container UUID.
  let earliest = -1;
  for (const root of KNOWN_RELATIVE_ROOTS) {
    const idx = absPath.indexOf(`/${root}`);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) earliest = idx;
  }
  if (earliest !== -1) return absPath.slice(earliest + 1); // skip the leading '/'
  // Last resort: return the basename component; better than a dead absolute path.
  return absPath.replace(/^.*\//, '');
}

/**
 * Resolve a stored (relative) path to an absolute path under the CURRENT
 * DocumentDir. Idempotent: if the stored value is already under the current
 * DocumentDir, it is returned unchanged.
 */
export function resolveOffline(storedPath: string): string {
  if (!storedPath.startsWith('/')) {
    // Relative path → prepend current DocumentDir.
    return `${fs.dirs.DocumentDir}/${storedPath}`;
  }
  // Already absolute — accept if it starts with the current DocumentDir
  // (same-session path), otherwise migrate to relative and re-resolve.
  const docDir = fs.dirs.DocumentDir;
  if (storedPath.startsWith(docDir)) return storedPath;
  // Old UUID absolute path: convert to relative then resolve.
  return resolveOffline(toRelative(storedPath));
}

/** A filesystem-safe segment for a readableKey (`page:file:42` → `page_file_42`). */
export function safeKey(readableKey: string): string {
  return readableKey.replace(/[^A-Za-z0-9._-]+/g, '_');
}

/** The on-device directory holding a readable's offline files. */
export function localReadableDir(readableKey: string): string {
  return `${offlineRoot()}/${safeKey(readableKey)}`;
}

/** Path of the small JSON sidecar describing a readable's offline layout. */
export function offlineManifestPath(readableKey: string): string {
  return `${localReadableDir(readableKey)}/offline.json`;
}

/** The persisted sidecar shape, used by the reader to resolve a local copy. */
export interface OfflineManifest {
  type: 'comics' | 'pdf' | 'audio' | 'ebook';
  localPaths: string[];
  pageCount?: number;
  trackCount?: number;
  /** On-device path of the cached cover image, when one was downloaded. */
  coverPath?: string;
  /** The source cover URL (kept as a fallback if the local copy is missing). */
  coverUrl?: string | null;
  /** Title captured at download time, so the Downloads list reads offline. */
  title?: string;
  /** Mobile content-type captured at download time (for the row pill). */
  contentType?: string;
  /** Series display name captured at download time, so the Downloads manager can
   * group + label volumes without a live library join. */
  seriesName?: string;
  /** Volume identifier label (e.g. "Vol. 3" or "Vol. 1.5") captured at download
   * time, so the Downloads manager can show which volume is downloaded instead of
   * repeating the series name. */
  volumeLabel?: string;
  /** Series + volume this readable belongs to — lets the Downloads manager group
   * volumes under their series. */
  seriesId?: number;
  volumeId?: number;
  /** Epoch ms when this copy was downloaded — drives the 30-day expiry sweep. */
  downloadedAt?: number;
}

export type DownloadResult =
  | { ok: true; localPaths: string[] }
  | { ok: false; reason: string };

export interface DownloadArgs {
  manifest: ReaderManifest;
  serverUrl: string;
  token: string;
  /**
   * Cover image URL to cache for offline display. May be SERVER-relative
   * (`/api/...`, fetched with the bearer + serverUrl prefix) or an absolute
   * external CDN URL (`http(s)://…`, fetched with NO auth header).
   */
  coverUrl?: string | null;
  /** Title to persist in the sidecar so the Downloads list reads offline. */
  title?: string;
  /** Mobile content-type to persist for the Downloads row pill. */
  contentType?: string;
  /** Series display name to persist so the Downloads list groups + labels offline. */
  seriesName?: string;
  /** Volume identifier label (e.g. "Vol. 3") to persist so the Downloads list shows
   * which volume is downloaded rather than repeating the series name. */
  volumeLabel?: string;
  /** Aggregate progress callback: `pct` 0..100, `bytes` summed across files. */
  onProgress?: (pct: number, bytes: number) => void;
  /**
   * Injectable per-file fetch — fetch `url` (with `headers`) to `savePath`,
   * reporting per-file byte progress. Defaults to the rnbu-backed downloader.
   * Injecting it keeps the orchestration testable without the native module.
   */
  fetchFile?: FetchFile;
  /**
   * Optional cancel-registrar. Called with the current per-file native task's
   * `.cancel()` each time a new file fetch starts, so the orchestrator can stop
   * an in-flight transfer (e.g. on app background) instead of letting iOS
   * silently restart the suspended transfer from 0. Forwarded to `fetchFile`.
   */
  onTask?: OnTask;
}

/**
 * Optional hook to register the underlying native task's cancel function so the
 * orchestrator can proactively cancel an in-flight transfer (e.g. on app
 * background, where iOS otherwise restarts the suspended NSURLSession from 0).
 * Called with the current task's `.cancel()` each time a new native fetch
 * starts; pass `undefined`/no-op when not needed (keeps every call site optional).
 */
export type OnTask = (cancel: () => void) => void;

/** Fetch one file to a path, reporting bytes received so far for THIS file. */
export type FetchFile = (
  url: string,
  headers: Record<string, string>,
  savePath: string,
  onBytes: (received: number, total: number) => void,
  onTask?: OnTask,
) => Promise<string>;

/**
 * Per-file native timeout (ms). A suspended/dead connection (e.g. the app was
 * backgrounded mid-download → the native fetch is suspended) must REJECT rather
 * than hang forever — rnbu's native `timeout` fires even while JS is paused,
 * whereas a JS setTimeout would not. The orchestrator (`readerDownloadsStore`)
 * then resumes the interrupted download on foreground.
 */
const PER_FILE_TIMEOUT_MS = 60_000;

/**
 * rnbu config for an offline-download fetch.
 *
 * On iOS we opt into a BACKGROUND NSURLSession (`IOSBackgroundTask`) so an
 * in-flight transfer is carried across app SUSPENSION by the OS and lands at
 * `path` on completion — instead of a foreground task that iOS suspends and
 * restarts from byte 0 on return. A background download is OS-managed, so we
 * deliberately do NOT set `PER_FILE_TIMEOUT_MS`: an aggressive request timeout
 * would abort a transfer that legitimately spans a suspension.
 *
 * Off iOS (Android) we keep the foreground data task + the 60s timeout, whose
 * "a dead/suspended socket rejects rather than hangs" behaviour the manual
 * Range-resume path still depends on.
 */
export function rnbuDownloadConfig(path: string): ReactNativeBlobUtilConfig {
  return Platform.OS === 'ios'
    ? { path, IOSBackgroundTask: true }
    : { path, timeout: PER_FILE_TIMEOUT_MS };
}

/** Default per-file downloader, backed by react-native-blob-util. */
export const rnbuFetchFile: FetchFile = async (url, headers, savePath, onBytes, onTask) => {
  const task = ReactNativeBlobUtil.config(rnbuDownloadConfig(savePath))
    .fetch('GET', url, headers);
  // Expose this native task's cancel so the orchestrator can stop the transfer
  // (the partial stays on disk; iOS writes directly to `path`).
  onTask?.(() => {
    try {
      task.cancel();
    } catch {
      /* already settled — nothing to cancel */
    }
  });
  const res = await task.progress((received, total) => onBytes(Number(received), Number(total)));
  const status = res.info().status;
  if (status < 200 || status >= 300) {
    throw new Error(`download failed: ${status} for ${url}`);
  }
  return res.path() || savePath;
};

/** Low-level filesystem + fetch ops, injected so the primitive is unit-testable. */
export interface ResumeDeps {
  /** On-disk size of `path`, or 0 if it doesn't exist. */
  statSize: (path: string) => Promise<number>;
  exists: (path: string) => Promise<boolean>;
  unlink: (path: string) => Promise<void>;
  /** Append the CONTENTS of file `src` onto `dest`. */
  appendFile: (dest: string, src: string) => Promise<void>;
  /** On-disk size of `path` after a write (for the post-append total check). */
  finalSize: (path: string) => Promise<number>;
  /** Fetch `url` (with `headers`) to `path`, reporting bytes; resolves the HTTP
   *  status + the response's total size (from Content-Range total, else Content-Length).
   *  `onTask` (optional) registers the native task's cancel so a transfer can be
   *  stopped (e.g. on app background) instead of letting iOS restart it from 0. */
  fetchToPath: (
    url: string,
    headers: Record<string, string>,
    path: string,
    onBytes: (received: number, total: number) => void,
    onTask?: OnTask,
  ) => Promise<{ status: number; total: number }>;
}

/** Parse the TOTAL from a `Content-Range: bytes A-B/TOTAL` header (case-insensitive). */
function parseContentRangeTotal(headers: Record<string, string>): number {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-range');
  const v = key ? headers[key] : undefined;
  const m = v ? /\/(\d+)\s*$/.exec(v) : null;
  return m ? Number(m[1]) : 0;
}

const rnbuResumeDeps: ResumeDeps = {
  statSize: async (path) => {
    try { return Number((await ReactNativeBlobUtil.fs.stat(path)).size) || 0; } catch { return 0; }
  },
  exists: (path) => ReactNativeBlobUtil.fs.exists(path),
  unlink: async (path) => { try { await ReactNativeBlobUtil.fs.unlink(path); } catch { /* gone */ } },
  appendFile: async (dest, src) => { await ReactNativeBlobUtil.fs.appendFile(dest, src, 'uri'); },
  finalSize: async (path) => {
    try { return Number((await ReactNativeBlobUtil.fs.stat(path)).size) || 0; } catch { return 0; }
  },
  fetchToPath: async (url, headers, path, onBytes, onTask) => {
    const task = ReactNativeBlobUtil.config(rnbuDownloadConfig(path))
      .fetch('GET', url, headers);
    onTask?.(() => {
      try {
        task.cancel();
      } catch {
        /* already settled — nothing to cancel */
      }
    });
    const res = await task.progress((received, total) => onBytes(Number(received), Number(total)));
    const info = res.info();
    const respHeaders = (info.headers ?? {}) as Record<string, string>;
    const clKey = Object.keys(respHeaders).find((k) => k.toLowerCase() === 'content-length');
    const total = parseContentRangeTotal(respHeaders)
      || Number(clKey ? respHeaders[clKey] : 0);
    return { status: info.status, total };
  },
};

/**
 * Resumable single-file fetch (disk-as-source-of-truth). Drop-in `FetchFile`.
 * - No partial on disk → normal GET to `savePath`.
 * - Partial on disk → `Range: bytes=<E>-`: 206 appends the remainder; 416 means
 *   already complete (skip); 200 means the server ignored the range (overwrite).
 * After a 206 append, verifies the final on-disk size == the Content-Range total;
 * on mismatch, re-fetches the whole file from 0 once. Reports `E + received` so
 * the aggregate progress math stays correct.
 */
export const resumableFetchFile = async (
  url: string,
  headers: Record<string, string>,
  savePath: string,
  onBytes: (received: number, total: number) => void,
  onTask?: OnTask,
  deps: ResumeDeps = rnbuResumeDeps,
): Promise<string> => {
  const partPath = `${savePath}.part`;
  // Clean any leftover .part from an append interrupted last run.
  if (await deps.exists(partPath)) await deps.unlink(partPath);

  const existing = await deps.statSize(savePath);

  // Fresh download — straight to savePath (no Range), today's behavior.
  const fresh = async (): Promise<string> => {
    const { status } = await deps.fetchToPath(url, headers, savePath, (r, t) => onBytes(r, t), onTask);
    if (status < 200 || status >= 300) throw new Error(`download failed: ${status} for ${url}`);
    return savePath;
  };

  if (existing <= 0) return fresh();

  // Resume — request the remainder.
  const rangeHeaders = { ...headers, Range: `bytes=${existing}-` };
  const { status, total } = await deps.fetchToPath(url, rangeHeaders, partPath, (r, t) =>
    onBytes(existing + r, t > 0 ? t : 0), onTask,
  );

  if (status === 416) {
    // Range not satisfiable → already complete. Report full + skip.
    onBytes(existing, existing);
    await deps.unlink(partPath);
    return savePath;
  }
  if (status === 200) {
    // Server ignored Range → the .part now holds the FULL file from 0. Overwrite.
    await deps.unlink(savePath);
    // Re-fetch directly to savePath to avoid a rename dependency.
    await deps.unlink(partPath);
    return fresh();
  }
  if (status === 206) {
    await deps.appendFile(savePath, partPath);
    await deps.unlink(partPath);
    const finalSz = await deps.finalSize(savePath);
    if (total > 0 && finalSz !== total) {
      // Corrupt/short append → start the file over once.
      await deps.unlink(savePath);
      return fresh();
    }
    return savePath;
  }
  throw new Error(`download failed: ${status} for ${url}`);
};

/** The set of files (url → save path) to fetch for a given readable. */
interface DownloadPlan {
  type: OfflineManifest['type'];
  files: { url: string; savePath: string }[];
  pageCount?: number;
  trackCount?: number;
}

/** Build the download plan for a manifest, or null if offline is unsupported. */
function planFor(manifest: ReaderManifest, serverUrl: string): DownloadPlan | null {
  const dir = localReadableDir(manifest.readableKey);
  const base = serverUrl.replace(/\/$/, '');

  if (manifest.format === 'epub') return null;

  if (manifest.format === 'pdf') {
    const parsed = parseReadableKey(manifest.readableKey);
    if (parsed.kind !== 'page') return null;
    return {
      type: 'pdf',
      files: [{ url: `${base}/api/reader/pdf/${parsed.fileId}`, savePath: `${dir}/doc.pdf` }],
    };
  }

  // MOBI / AZW3: foliate-js renders the raw file client-side, so — like pdf —
  // we cache the WHOLE file. It streams from the ebook download route (the
  // session bearer authenticates it; offline reading reads the local copy).
  if (manifest.format === 'mobi' || manifest.format === 'azw3') {
    const parsed = parseReadableKey(manifest.readableKey);
    if (parsed.kind !== 'page') return null;
    return {
      type: 'ebook',
      files: [
        {
          url: `${base}/api/reader/ebook/${parsed.fileId}/download`,
          savePath: `${dir}/book.${manifest.format}`,
        },
      ],
    };
  }

  if (manifest.reader === 'audio') {
    const tracks = manifest.tracks ?? [];
    return {
      type: 'audio',
      trackCount: tracks.length,
      files: tracks.map((t, i) => ({
        url: `${base}/api/reader/audio/${t.fileId}`,
        savePath: `${dir}/track-${i}`,
      })),
    };
  }

  // Comics (manga/comic): one image per page.
  const parsed = parseReadableKey(manifest.readableKey);
  if (parsed.kind !== 'page') return null;
  const pageCount = Math.max(0, manifest.pageCount ?? 0);
  return {
    type: 'comics',
    pageCount,
    files: Array.from({ length: pageCount }, (_, n) => ({
      url: `${base}/api/reader/comics/${parsed.fileId}/page/${n}`,
      savePath: `${dir}/page-${n}`,
    })),
  };
}

/**
 * Download all of a readable's files to device storage, reporting aggregate
 * progress. Returns `{ ok:true, localPaths }` on success, or `{ ok:false,
 * reason }` (epub unsupported, or any fetch/IO error). Side effects: writes the
 * files plus an `offline.json` sidecar under `localReadableDir`.
 */
export async function downloadReadable(args: DownloadArgs): Promise<DownloadResult> {
  const { manifest, serverUrl, token, onProgress } = args;
  const fetchFile: FetchFile = args.fetchFile ?? resumableFetchFile;

  const plan = planFor(manifest, serverUrl);
  if (plan === null) {
    if (manifest.format === 'epub') {
      return { ok: false, reason: 'epub-offline-unsupported' };
    }
    return { ok: false, reason: 'unsupported-readable' };
  }

  const headers = { Authorization: `Bearer ${token}` };
  const total = plan.files.length;
  const localPaths: string[] = [];

  // Per-file byte tallies so aggregate progress can sum live bytes across files.
  const fileBytes = new Array<number>(total).fill(0);

  try {
    // Ensure the target directory exists (no-op in mock).
    await fs.mkdir(localReadableDir(manifest.readableKey)).catch(() => undefined);

    for (let i = 0; i < plan.files.length; i++) {
      const { url, savePath } = plan.files[i]!;
      const path = await fetchFile(url, headers, savePath, (received) => {
        fileBytes[i] = received;
        report(onProgress, i, total, fileBytes);
      }, args.onTask);
      // Store relative paths so the sidecar survives container UUID rotation on
      // app updates. The actual bytes are at the same relative location under any
      // DocumentDir, so resolveOffline(relPath) always yields the live path.
      localPaths.push(toRelative(path));
      // After a file completes, its share of progress is fully counted.
      report(onProgress, i + 1, total, fileBytes);
    }

    // Cache the cover image so the Downloads list shows real art offline.
    // Best-effort: a missing/blocked cover must never fail the whole download.
    // No auth header — server covers are served by the public `/api/img` proxy
    // (no bearer needed), and an absolute external CDN URL (MangaDex / Google
    // Books / …) must never receive the server token. A server-relative path is
    // just prefixed with the server URL.
    let coverPath: string | undefined;
    if (args.coverUrl) {
      const dir = localReadableDir(manifest.readableKey);
      const base = serverUrl.replace(/\/$/, '');
      const coverFetchUrl = args.coverUrl.startsWith('/') ? `${base}${args.coverUrl}` : args.coverUrl;
      try {
        const rawCoverPath = await fetchFile(coverFetchUrl, {}, `${dir}/cover.img`, () => {});
        coverPath = toRelative(rawCoverPath);
      } catch {
        coverPath = undefined;
      }
    }

    // Always emit a terminal 100% (covers zero-byte / no-progress fetches).
    const bytes = fileBytes.reduce((a, b) => a + b, 0);
    onProgress?.(100, bytes);

    // Persist the sidecar so the reader can resolve the local copy later, and so
    // the Downloads manager can render the cover + title/type without a network
    // round-trip or a library join.
    // NOTE: localPaths and coverPath are stored as RELATIVE paths (relative to
    // fs.dirs.DocumentDir). Use resolveOffline() to get the live absolute path.
    const sidecar: OfflineManifest = {
      type: plan.type,
      localPaths,
      ...(plan.pageCount !== undefined ? { pageCount: plan.pageCount } : {}),
      ...(plan.trackCount !== undefined ? { trackCount: plan.trackCount } : {}),
      ...(coverPath !== undefined ? { coverPath } : {}),
      ...(args.coverUrl ? { coverUrl: args.coverUrl } : {}),
      ...(args.title ? { title: args.title } : {}),
      ...(args.contentType ? { contentType: args.contentType } : {}),
      ...(args.seriesName ? { seriesName: args.seriesName } : {}),
      ...(args.volumeLabel ? { volumeLabel: args.volumeLabel } : {}),
      seriesId: manifest.seriesId,
      ...(manifest.volumeId != null ? { volumeId: manifest.volumeId } : {}),
      downloadedAt: Date.now(),
    };
    await fs.writeFile(offlineManifestPath(manifest.readableKey), JSON.stringify(sidecar), 'utf8');

    return { ok: true, localPaths };
  } catch {
    return { ok: false, reason: 'download-failed' };
  }
}

/**
 * Emit aggregate progress: completed files contribute a full share, the
 * in-flight file contributes nothing to the file-count fraction (its bytes are
 * still summed for the byte readout). `done` = number of files fully complete.
 */
function report(
  onProgress: DownloadArgs['onProgress'],
  done: number,
  total: number,
  fileBytes: number[],
): void {
  if (!onProgress) return;
  const pct = total === 0 ? 100 : Math.min(100, Math.round((done / total) * 100));
  const bytes = fileBytes.reduce((a, b) => a + b, 0);
  onProgress(pct, bytes);
}

/** Delete a readable's entire offline directory (best-effort). */
export async function deleteOfflineReadable(readableKey: string): Promise<void> {
  try {
    await fs.unlink(localReadableDir(readableKey));
  } catch {
    // Already gone / never downloaded — nothing to clean up.
  }
}

/** A single offline-resident readable + its on-disk size. */
export interface OfflineEntry {
  readableKey: string;
  manifest: OfflineManifest;
  bytes: number;
  lastReadAt: number; // epoch ms; 0 if unavailable
}

/**
 * Scan `<DocumentDir>/reader/` for every sub-directory with a valid
 * `offline.json`. Returns one entry per readable, with the on-disk byte
 * total (sum of `localPaths` file sizes). Failures on individual entries
 * are silently skipped — the manager UI never refuses to render because
 * one stale folder is corrupt.
 */
export async function enumerateOfflineReadables(): Promise<OfflineEntry[]> {
  const root = offlineRoot();
  let dirs: string[];
  try {
    dirs = (await fs.ls(root)) ?? [];
  } catch {
    return [];
  }
  const entries: OfflineEntry[] = [];
  for (const dirname of dirs) {
    const dir = `${root}/${dirname}`;
    const sidecarPath = `${dir}/offline.json`;
    let manifest: OfflineManifest;
    try {
      const raw = await fs.readFile(sidecarPath, 'utf8');
      manifest = JSON.parse(raw) as OfflineManifest;
    } catch {
      continue;
    }

    // MIGRATION: if localPaths or coverPath are absolute (legacy sidecars written
    // before this fix), convert them to relative paths and rewrite the sidecar.
    // This is a one-time migration per sidecar: subsequent reads will be clean.
    // The migration is robust to old iOS container UUIDs: toRelative() splits on
    // '/reader/' so `reader/<key>/...` is preserved regardless of the prefix.
    const needsMigration =
      manifest.localPaths.some((p) => p.startsWith('/')) ||
      (manifest.coverPath !== undefined && manifest.coverPath.startsWith('/'));
    if (needsMigration) {
      manifest = {
        ...manifest,
        localPaths: manifest.localPaths.map(toRelative),
        ...(manifest.coverPath !== undefined
          ? { coverPath: toRelative(manifest.coverPath) }
          : {}),
      };
      // Persist the migrated sidecar so this only happens once.
      try {
        await fs.writeFile(sidecarPath, JSON.stringify(manifest), 'utf8');
      } catch {
        /* migration write failed — proceed with migrated in-memory copy anyway */
      }
    }

    let bytes = 0;
    let lastReadAt = 0;
    // Sum the content files plus the cached cover (when present) so the size
    // readout reflects everything on disk for this readable.
    // IMPORTANT: resolve stored (relative) paths to absolute before stat.
    const sizedPaths = manifest.coverPath
      ? [...manifest.localPaths, manifest.coverPath]
      : manifest.localPaths;
    for (const p of sizedPaths) {
      try {
        const resolved = resolveOffline(p);
        const stat = await fs.stat(resolved);
        // rnbu's stat returns { size, lastModified } where size is a string of bytes
        const size = Number(stat?.size ?? 0);
        if (Number.isFinite(size)) bytes += size;
        const mtime = Number(stat?.lastModified ?? 0);
        if (mtime > lastReadAt) lastReadAt = mtime;
      } catch {
        /* skip stat failures */
      }
    }
    // Re-derive the readableKey from the safe-key directory name when possible —
    // for that we'd need a reverse map; for now stash the safe key and let the
    // hook join with library data using a sidecar field instead. The
    // `enumerateOfflineReadables` returns the directory name as `readableKey`
    // (which is the safe-key — consumers should treat it as opaque or look it
    // up against their own state).
    entries.push({ readableKey: dirname, manifest, bytes, lastReadAt });
  }
  return entries;
}

/**
 * Remove a readable's offline directory + all files within. Safe to call when
 * nothing is there.
 */
export async function removeOfflineReadable(readableKey: string): Promise<void> {
  const dir = localReadableDir(readableKey);
  try {
    await fs.unlink(dir);
  } catch {
    /* directory may already be gone; intentionally lenient */
  }
}

/** How long offline content is kept before the expiry sweep removes it. */
export const OFFLINE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OFFLINE_TTL_DAYS = 30;

/**
 * Delete offline copies older than `ttlMs`. Age is taken from the sidecar's
 * `downloadedAt`, falling back to the newest file mtime for copies predating that
 * field. Entries with no determinable age are kept (never wipe blindly). Returns
 * the safe-key dirnames removed so callers can also clear the persisted store.
 */
export async function wipeExpiredOfflineReadables(
  ttlMs: number = OFFLINE_TTL_MS,
  now: number = Date.now(),
): Promise<string[]> {
  const entries = await enumerateOfflineReadables();
  const removed: string[] = [];
  for (const e of entries) {
    const stamp = e.manifest.downloadedAt ?? e.lastReadAt;
    if (!stamp || stamp <= 0) continue; // unknown age → keep
    if (now - stamp > ttlMs) {
      await removeOfflineReadable(e.readableKey);
      removed.push(e.readableKey);
    }
  }
  return removed;
}

/**
 * Whether a download may proceed under the Wi-Fi-only preference. Best-effort:
 * blocks only when we can positively confirm a cellular connection; an unknown
 * or unreadable network type allows the download (never block on uncertainty).
 */
export async function networkAllowsDownload(wifiOnly: boolean): Promise<boolean> {
  if (!wifiOnly) return true;
  try {
    const s = await NetInfo.fetch();
    if (s.type === 'cellular') return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Fraction of device storage that is free (0..1), or null if it can't be read.
 * Used to refuse a download when space is critically low.
 */
export async function freeDiskFraction(): Promise<number | null> {
  try {
    const { free, total } = (await fs.df()) as { free: number; total: number };
    if (!total || total <= 0) return null;
    return free / total;
  } catch {
    return null;
  }
}

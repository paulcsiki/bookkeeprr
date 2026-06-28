// Centralized, controllable Jest mock for `react-native-blob-util`.
//
// `tests/setup.ts` wires this in via `jest.mock(...)` so every suite gets the
// same controllable surface. Tests that need to assert the fetched URLs /
// headers / save paths, or to drive download progress + completion, import the
// `__*` helpers from this file directly.
//
// The real module is used as `ReactNativeBlobUtil.config({ path }).fetch(method,
// url, headers)`, which returns a *thenable that also carries `.progress(cb)`*
// and resolves to a response with `.path()` and `.info()`. We faithfully model
// that shape so the production code (which chains `.progress(...)` before
// awaiting) exercises the same code path it would on a device.

export interface FetchCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** The `path` passed to `config({ path })` for this fetch (the save target). */
  path: string | undefined;
}

interface MockState {
  /** Every `config().fetch()` invocation, in order. */
  calls: FetchCall[];
  /** When set, the NEXT fetch rejects with this error (then it clears). */
  failNext: Error | null;
  /** HTTP status the resolved response reports via `.info()`. */
  status: number;
  /** Registered progress callbacks (one per in-flight fetch), for `__emitProgress`.
   *  The real rnbu API hands the callback STRING counts, so we mirror that. */
  progressCbs: Array<(received: string, total: string) => void>;
  /** Paths passed to `fs.unlink`. */
  unlinked: string[];
  /** Files "written" via `writeFile` (path → data), so tests can assert manifests. */
  written: Record<string, string>;
  /** Paths that `fs.exists` should report as present. */
  existing: Set<string>;
  /** File sizes (bytes) returned by `fs.stat`, keyed by path. */
  fileSizes: Record<string, number>;
  /** Directories returned by `fs.ls`, keyed by directory path. */
  dirContents: Record<string, string[]>;
}

const state: MockState = {
  calls: [],
  failNext: null,
  status: 200,
  progressCbs: [],
  unlinked: [],
  written: {},
  existing: new Set(),
  fileSizes: {},
  dirContents: {},
};

export function __resetBlobUtil(): void {
  state.calls = [];
  state.failNext = null;
  state.status = 200;
  state.progressCbs = [];
  state.unlinked = [];
  state.written = {};
  state.existing = new Set();
  state.fileSizes = {};
  state.dirContents = {};
  holdNext = false;
}

/** Set the size (bytes) that `fs.stat` will return for a given path. */
export function __setFileSize(path: string, bytes: number): void {
  state.fileSizes[path] = bytes;
}

/** Set the list of directory entries that `fs.ls` will return for a given dir path. */
export function __setDirContents(dirPath: string, entries: string[]): void {
  state.dirContents[dirPath] = entries;
}

/** All fetch calls recorded so far (URL/header/path assertions). */
export function __getFetchCalls(): readonly FetchCall[] {
  return state.calls;
}

/** Make the next `fetch` reject (to exercise the error path). */
export function __failNextFetch(err: Error = new Error('network down')): void {
  state.failNext = err;
}

/** Drive every registered in-flight progress callback (real API passes strings). */
export function __emitProgress(received: number, total: number): void {
  for (const cb of state.progressCbs) cb(String(received), String(total));
}

export function __getUnlinked(): readonly string[] {
  return state.unlinked;
}

export function __getWritten(): Readonly<Record<string, string>> {
  return state.written;
}

export function __setExists(path: string, exists: boolean): void {
  if (exists) state.existing.add(path);
  else state.existing.delete(path);
}

/**
 * A thenable that also carries `.progress(cb)` and `.cancel()`, mirroring the
 * real rnbu return type (a StatefulPromise). `.cancel()` rejects an in-flight
 * (held) fetch with a "canceled" error, exactly as the native task does.
 */
interface StatefulPromise<T> extends Promise<T> {
  progress: (cb: (received: string, total: string) => void) => StatefulPromise<T>;
  cancel: () => void;
}

/** When true, the NEXT fetch HANGS (never resolves) until `.cancel()` is called.
 *  Lets a test exercise the cancel-aborts-an-in-flight-transfer path. */
let holdNext = false;

/** Make the next `fetch` hang until cancelled (or the test rejects it). */
export function __holdNextFetch(): void {
  holdNext = true;
}

function makeFetch(savePath: string | undefined) {
  return (method: string, url: string, headers: Record<string, string> = {}) => {
    state.calls.push({ method, url, headers, path: savePath });

    const result = {
      path: () => savePath ?? '',
      info: () => ({ status: state.status }),
    };

    let rejectFetch: ((err: Error) => void) | null = null;
    let base: Promise<typeof result>;
    if (state.failNext !== null) {
      const err = state.failNext;
      state.failNext = null;
      base = Promise.reject(err);
    } else if (holdNext) {
      holdNext = false;
      // Hang until cancelled: only `.cancel()` settles this fetch.
      base = new Promise<typeof result>((_resolve, reject) => {
        rejectFetch = reject;
      });
    } else {
      base = Promise.resolve(result);
    }

    const stateful = base as StatefulPromise<typeof result>;
    stateful.progress = (cb: (received: string, total: string) => void) => {
      state.progressCbs.push(cb);
      return stateful;
    };
    stateful.cancel = () => {
      // The real native task rejects the in-flight fetch promise on cancel.
      rejectFetch?.(new Error('canceled'));
    };
    return stateful;
  };
}

const ReactNativeBlobUtil = {
  config: (opts: { path?: string } = {}) => ({
    fetch: makeFetch(opts.path),
  }),
  fs: {
    dirs: {
      DocumentDir: '/mock/Documents',
      CacheDir: '/mock/Caches',
    },
    unlink: jest.fn(async (path: string) => {
      state.unlinked.push(path);
      state.existing.delete(path);
    }),
    exists: jest.fn(async (path: string) => state.existing.has(path)),
    ls: jest.fn(async (dirPath: string) => state.dirContents[dirPath] ?? ([] as string[])),
    stat: jest.fn(async (path: string) => {
      const size = state.fileSizes[path] ?? 0;
      return { size: String(size), lastModified: String(Date.now()) };
    }),
    writeFile: jest.fn(async (path: string, data: string, _encoding?: string) => {
      state.written[path] = data;
      state.existing.add(path);
    }),
    readFile: jest.fn(async (path: string, _encoding?: string) => state.written[path] ?? ''),
    mkdir: jest.fn(async () => undefined),
  },
};

export default ReactNativeBlobUtil;

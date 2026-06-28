import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import {
  parseReadableKey,
  ProgressPutBody,
  type ReaderContentType,
  type ReaderLocator,
  type ReaderProgress,
} from '@/api/schemas';
import { getDeviceId, getDeviceName } from '@/lib/device-id';

const DEBOUNCE_MS = 800;
/** Position at/above which the server marks the readable finished. */
const FINISH_THRESHOLD = 0.999;

/** The fields a `commit` needs that don't come from the readableKey. */
export interface ReadingProgressContext {
  seriesId: number;
  volumeId?: number | null;
  contentType: ReaderContentType;
  /** Optional debounce override (ms). Defaults to {@link DEBOUNCE_MS}. Mainly for tests. */
  debounceMs?: number;
}

export interface UseReadingProgress {
  /** The seed progress this readable was opened with, if any. */
  progress: ReaderProgress | undefined;
  /** Record a new position + locator. Debounced (~800ms) before it hits the server. */
  commit: (position: number, locator: ReaderLocator) => void;
  /** Send the latest pending position immediately (e.g. on exit). */
  flush: () => void;
  /** The stable device UUID for this installation (resolved asynchronously). */
  deviceId: string;
}

/** Derive the libraryFileId a `page:file:<id>` key addresses; null otherwise. */
function libraryFileIdFor(readableKey: string): number | null {
  try {
    const parsed = parseReadableKey(readableKey);
    return parsed.kind === 'page' ? parsed.fileId : null;
  } catch {
    return null;
  }
}

function progressUrl(readableKey: string): string {
  return `/api/reader/progress/${encodeURIComponent(readableKey)}`;
}

/**
 * Debounced reading-progress sync for a single readable.
 *
 * `commit` schedules a debounced PUT so rapid page turns collapse into a single
 * write. The latest pending value is flushed — via a DIRECT, fire-and-forget PUT
 * (not a component-bound mutation that React may tear down) — when the reader
 * unmounts (back out), when the app is backgrounded, or when `flush()` is called
 * explicitly. A finished read (position ≥ 0.999) is sent immediately rather than
 * debounced, so a quick exit on the last page can't drop the "finished" signal.
 */
export function useReadingProgress(
  readableKey: string,
  ctx: ReadingProgressContext,
  seed?: ReaderProgress,
): UseReadingProgress {
  const { state, signOut } = useAuth();

  const pendingRef = useRef<ProgressPutBody | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef<string>('');
  const deviceNameRef = useRef<string>(getDeviceName());

  // Resolve the async device ID once on mount.
  useEffect(() => {
    void getDeviceId().then((id) => {
      deviceIdRef.current = id;
    });
  }, []);

  // Keep the latest auth + context available to the debounced timer without
  // re-creating `commit` (which would reset in-flight debounces).
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const keyRef = useRef(readableKey);
  keyRef.current = readableKey;
  const authRef = useRef(state);
  authRef.current = state;

  // Direct, fire-and-forget PUT. Used by the debounce timer, immediate-finish,
  // and flush. Independent of the React component lifecycle so it still goes out
  // when called from an unmount cleanup.
  const sendNow = useCallback(
    (body: ProgressPutBody) => {
      const auth = authRef.current;
      if (auth.status !== 'authenticated') return;
      const client = createApiClient(auth.creds, { onAuthFail: () => signOut() });
      void client.put(progressUrl(keyRef.current), body).catch(() => {
        /* progress is best-effort; a dropped write is retried on the next commit */
      });
    },
    [signOut],
  );

  /** Send the latest pending position now, cancelling any pending debounce. */
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const body = pendingRef.current;
    pendingRef.current = null;
    if (body !== null) sendNow(body);
  }, [sendNow]);

  const commit = useCallback(
    (position: number, locator: ReaderLocator): void => {
      const c = ctxRef.current;
      const body: ProgressPutBody = {
        position,
        locator,
        seriesId: c.seriesId,
        volumeId: c.volumeId ?? null,
        libraryFileId: libraryFileIdFor(keyRef.current),
        contentType: c.contentType,
        deviceId: deviceIdRef.current || null,
        deviceName: deviceNameRef.current || null,
      };
      pendingRef.current = body;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Persist a finished read immediately — don't risk losing it to the
      // debounce window if the user exits right after reaching the end.
      if (position >= FINISH_THRESHOLD) {
        pendingRef.current = null;
        sendNow(body);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending !== null) sendNow(pending);
      }, ctxRef.current.debounceMs ?? DEBOUNCE_MS);
    },
    [sendNow],
  );

  // Flush the latest position on unmount (back out of the reader).
  useEffect(() => {
    return () => flush();
  }, [flush]);

  // Flush when the app is backgrounded — users often swipe the app away rather
  // than pressing back, which wouldn't unmount the reader.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'background' || status === 'inactive') flush();
    });
    return () => sub.remove();
  }, [flush]);

  return { progress: seed, commit, flush, deviceId: deviceIdRef.current };
}

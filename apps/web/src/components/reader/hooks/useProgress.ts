'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  parseReadableKey,
  type ReaderLocator,
  type ReaderManifest,
} from '@bookkeeprr/types';
import { apiFetch } from '@/lib/api-fetch';
import { getDeviceId, getDeviceName } from '@/lib/device-id';

const DEBOUNCE_MS = 800;

/** The PUT body the progress route validates. */
type ProgressPut = {
  position: number;
  locator: ReaderLocator;
  seriesId: number;
  volumeId: number | null;
  libraryFileId: number | null;
  contentType: string;
  deviceId?: string | null;
  deviceName?: string | null;
};

/** A pending write: the body plus the readableKey it targets. */
type PendingWrite = { readableKey: string; body: ProgressPut };

export type UseProgress = {
  /** Latest locally-known position (optimistic; updates immediately on commit). */
  position: number;
  /** Record a new position + locator. Debounced before it hits the server. */
  commit: (position: number, locator: ReaderLocator) => void;
  /** Whether the readable was marked finished (from the manifest). */
  finished: boolean;
  /** Whether this open is a restart after a previous finish (from the manifest). */
  restartedFromFinish: boolean;
  /** The stable device ID for this browser session (from localStorage). */
  deviceId: string;
};

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
 * Optimistic, debounced reading-progress sync for a single readable.
 *
 * `commit` updates local state synchronously and schedules a debounced PUT
 * (~800ms) so rapid page turns collapse into a single write. The latest
 * pending value is flushed immediately on unmount and when the page is being
 * hidden (`pagehide` / `visibilitychange`), using `fetch(..., {keepalive})` so
 * the request survives navigation.
 */
export function useProgress(manifest: ReaderManifest | undefined): UseProgress {
  const seed = manifest?.progress.position ?? 0;
  const [position, setPosition] = useState(seed);

  // Read device identity once (localStorage is unavailable during SSR).
  const deviceIdRef = useRef<string>('');
  const deviceNameRef = useRef<string>('');
  useEffect(() => {
    deviceIdRef.current = getDeviceId();
    deviceNameRef.current = getDeviceName();
  }, []);

  // Hold the latest pending write and the debounce timer across renders.
  const pendingRef = useRef<PendingWrite | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manifestRef = useRef<ReaderManifest | undefined>(manifest);
  manifestRef.current = manifest;

  // Re-seed local position when a new manifest arrives (e.g. after load).
  useEffect(() => {
    setPosition(manifest?.progress.position ?? 0);
  }, [manifest?.readableKey, manifest?.progress.position]);

  // The normal (debounced) write path goes through react-query so retries /
  // status surfacing stay available to callers later.
  const mutation = useMutation({
    mutationFn: async (write: PendingWrite) => {
      const r = await apiFetch(progressUrl(write.readableKey), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(write.body),
      });
      if (!r.ok) throw new Error(`progress PUT failed: HTTP ${r.status}`);
      return r.json() as Promise<unknown>;
    },
  });
  const { mutate } = mutation;

  // The flush path (unmount / page-hide) must complete synchronously enough to
  // survive navigation, so it uses a keepalive fetch directly rather than the
  // async mutation lifecycle.
  const flush = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const write = pendingRef.current;
    if (write === null) return;
    pendingRef.current = null;
    void apiFetch(progressUrl(write.readableKey), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(write.body),
      keepalive: true,
    });
  }, []);

  const commit = useCallback(
    (next: number, locator: ReaderLocator): void => {
      const m = manifestRef.current;
      setPosition(next);
      if (m === undefined) return;
      const write: PendingWrite = {
        readableKey: m.readableKey,
        body: {
          position: next,
          locator,
          seriesId: m.seriesId,
          volumeId: m.volumeId ?? null,
          libraryFileId: libraryFileIdFor(m.readableKey),
          contentType: m.contentType,
          deviceId: deviceIdRef.current || null,
          deviceName: deviceNameRef.current || null,
        },
      };
      pendingRef.current = write;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending !== null) mutate(pending);
      }, DEBOUNCE_MS);
    },
    [mutate],
  );

  // Flush on page-hide / tab-hide and on unmount.
  useEffect(() => {
    const onHide = (): void => flush();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [flush]);

  return {
    position,
    commit,
    finished: manifest?.progress.finished ?? false,
    restartedFromFinish: manifest?.progress.restartedFromFinish ?? false,
    deviceId: deviceIdRef.current,
  };
}

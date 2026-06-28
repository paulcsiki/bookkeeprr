'use client';

import { useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-fetch';

const HEARTBEAT_URL = '/api/reader/stats/heartbeat';
const DEFAULT_INTERVAL_MS = 20_000;

export type UseReadingHeartbeatOptions = {
  /**
   * Whether the user is actively reading right now. Audio: playing. Paged:
   * mounted + visible (a reasonable approximation). Active wall-clock time is
   * accumulated only while this is true.
   */
  isActive: boolean;
  /** How often to POST accumulated time. Defaults to 20s. */
  intervalMs?: number;
  /**
   * Optional: return (and reset) the number of "units" (pages/chapters, or
   * listened-minutes for audio) consumed since the previous heartbeat. Called
   * once per flush. Omit when the reader has no unit signal.
   */
  getUnitDelta?: () => number;
  /**
   * The readable being read. Sent to the server so it can attribute the time
   * to the readable's series content type (the by-format donut). Omit and the
   * server falls back to the `'other'` sentinel.
   */
  readableKey?: string;
};

/**
 * Accumulates active reading time and POSTs it to the stats heartbeat endpoint
 * every `intervalMs`, plus a final flush on unmount (keepalive so it survives
 * navigation). Active time is wall-clock time spent while `isActive` is true,
 * so pausing audio or hiding the tab stops the meter.
 */
export function useReadingHeartbeat(opts: UseReadingHeartbeatOptions): void {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  // Accumulated active milliseconds not yet flushed.
  const accruedMsRef = useRef(0);
  // When the active span started; null while inactive.
  const activeSinceRef = useRef<number | null>(null);
  const getUnitDeltaRef = useRef(opts.getUnitDelta);
  getUnitDeltaRef.current = opts.getUnitDelta;
  const readableKeyRef = useRef(opts.readableKey);
  readableKeyRef.current = opts.readableKey;

  /** Fold any in-flight active span into the accrued total. */
  const settle = useCallback((): void => {
    if (activeSinceRef.current !== null) {
      accruedMsRef.current += Date.now() - activeSinceRef.current;
      activeSinceRef.current = Date.now();
    }
  }, []);

  const flush = useCallback(
    (keepalive: boolean): void => {
      settle();
      const seconds = Math.round(accruedMsRef.current / 1000);
      const units = getUnitDeltaRef.current?.() ?? 0;
      if (seconds <= 0 && units <= 0) return;
      accruedMsRef.current = 0;
      const readableKey = readableKeyRef.current;
      void apiFetch(HEARTBEAT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(readableKey !== undefined ? { seconds, units, readableKey } : { seconds, units }),
        keepalive,
      });
    },
    [settle],
  );

  // Start/stop the active-time meter as `isActive` changes.
  useEffect(() => {
    if (opts.isActive) {
      activeSinceRef.current = Date.now();
    } else {
      settle();
      activeSinceRef.current = null;
    }
  }, [opts.isActive, settle]);

  // Periodic flush.
  useEffect(() => {
    const id = setInterval(() => flush(false), intervalMs);
    return () => clearInterval(id);
  }, [flush, intervalMs]);

  // Flush on tab-hide and on unmount.
  useEffect(() => {
    const onHide = (): void => flush(true);
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flush(true);
    };
  }, [flush]);
}

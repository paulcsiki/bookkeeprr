import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

const HEARTBEAT_URL = '/api/reader/stats/heartbeat';
const DEFAULT_INTERVAL_MS = 20_000;

export interface UseReadingHeartbeatOptions {
  /**
   * Whether the user is actively reading right now. Audio: playing. Paged:
   * mounted. Active wall-clock time is accumulated only while this is true.
   */
  isActive: boolean;
  /** Heartbeat interval in ms. Defaults to 20s. Mainly overridden in tests. */
  intervalMs?: number;
  /**
   * Optional: return (and reset) the number of "units" (pages, or
   * listened-minutes for audio) consumed since the previous heartbeat.
   */
  getUnitDelta?: () => number;
  /**
   * The readable being read. Sent to the server so it can attribute the time
   * to the readable's series content type. Omit and the server falls back to
   * the `'other'` sentinel.
   */
  readableKey?: string;
}

/**
 * Accumulates active reading time and POSTs it to `/api/reader/stats/heartbeat`
 * every `intervalMs`, plus a final flush on unmount. Mirrors the web hook so
 * stats accumulate across devices. Fire-and-forget: failures are swallowed (a
 * dropped heartbeat just loses a few seconds of credit).
 */
export function useReadingHeartbeat(opts: UseReadingHeartbeatOptions): void {
  const { state, signOut } = useAuth();
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  const accruedMsRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);
  const getUnitDeltaRef = useRef(opts.getUnitDelta);
  getUnitDeltaRef.current = opts.getUnitDelta;
  const readableKeyRef = useRef(opts.readableKey);
  readableKeyRef.current = opts.readableKey;
  const authRef = useRef(state);
  authRef.current = state;

  const settle = useCallback((): void => {
    if (activeSinceRef.current !== null) {
      const now = Date.now();
      accruedMsRef.current += now - activeSinceRef.current;
      activeSinceRef.current = now;
    }
  }, []);

  const flush = useCallback((): void => {
    settle();
    const seconds = Math.round(accruedMsRef.current / 1000);
    const units = getUnitDeltaRef.current?.() ?? 0;
    if (seconds <= 0 && units <= 0) return;
    accruedMsRef.current = 0;
    const auth = authRef.current;
    if (auth.status !== 'authenticated') return;
    const client = createApiClient(auth.creds, { onAuthFail: () => signOut() });
    const readableKey = readableKeyRef.current;
    const body = readableKey !== undefined ? { seconds, units, readableKey } : { seconds, units };
    void client.post(HEARTBEAT_URL, body).catch(() => {
      // Swallow: a dropped heartbeat just loses a few seconds of credit.
    });
  }, [settle, signOut]);

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
    const id = setInterval(flush, intervalMs);
    return () => clearInterval(id);
  }, [flush, intervalMs]);

  // Final flush on unmount.
  useEffect(() => {
    return () => flush();
  }, [flush]);
}

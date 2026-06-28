/**
 * In-memory ring buffer for download speed samples.
 *
 * Module-level storage survives React re-renders and navigation within the SPA
 * (as long as the JS module is not reloaded). Max 60 samples (10 minutes at
 * 10-second polling intervals).
 */

const MAX_SAMPLES = 60;

export type SpeedSample = {
  speed: number; // bytes/sec aggregate
  totalBytes: number; // cumulative bytes transferred
  timestamp: number; // ms since epoch
};

/** Ring-buffer state; survives navigations as module-level state. */
const samples: SpeedSample[] = [];

/**
 * Push a new speed/bytes sample into the ring buffer.
 * Older samples beyond MAX_SAMPLES are dropped.
 */
export function pushSample(speed: number, totalBytes: number): void {
  samples.push({ speed, totalBytes, timestamp: Date.now() });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

/**
 * React hook — returns a copy of the current samples array (oldest-first).
 * Callers re-render via their own query invalidation; this hook is deliberately
 * NOT reactive (no useState/useEffect) since the parent component already
 * re-renders on the TanStack Query refetch cycle.
 */
export function useSpeedHistory(): readonly SpeedSample[] {
  return samples.slice();
}

/** Test helper — wipes the ring buffer. */
export function __resetSpeedHistoryForTests(): void {
  samples.splice(0);
}

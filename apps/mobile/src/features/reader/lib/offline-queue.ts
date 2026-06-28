// AsyncStorage-backed write queue for reading-progress commits that fail while
// the device is offline (or the server is unreachable). When `useReadingProgress`
// can't PUT a position to `/api/reader/progress/<key>`, it enqueues the intended
// write here; a later `flushQueue` (triggered on reconnect / app-foreground)
// drains the queue by re-issuing each write via an injected `putFn`.
//
// All logic is pure over an injected `putFn` + AsyncStorage so it can be
// unit-tested at the storage boundary (not the API shape). A corrupted blob is
// treated as an empty queue — progress is advisory, never a source of truth.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const OFFLINE_QUEUE_KEY = 'reader/offline-progress-queue/v1';

/** A single deferred progress write. `locator` is the format-specific cursor. */
export interface ProgressEntry {
  readableKey: string;
  position: number;
  locator: unknown;
  /** epoch ms the write was attempted; used for ordering / debugging. */
  at: number;
}

/** Outcome of a flush: how many entries were sent vs. left for next time. */
export interface FlushResult {
  flushed: number;
  remaining: number;
}

/** Load the persisted queue. Returns `[]` for an empty or corrupted store. */
export async function loadQueue(): Promise<ProgressEntry[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ProgressEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(entries: ProgressEntry[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(entries));
}

/** Append a deferred progress write to the persisted queue. */
export async function enqueueProgress(entry: ProgressEntry): Promise<void> {
  const queue = await loadQueue();
  queue.push(entry);
  await saveQueue(queue);
}

/**
 * Drain the queue by calling `putFn` per entry in order. Entries whose `putFn`
 * resolves are removed; entries whose `putFn` rejects are retained (in order)
 * for the next flush. The surviving queue is persisted back.
 */
export async function flushQueue(
  putFn: (entry: ProgressEntry) => Promise<void>,
): Promise<FlushResult> {
  const queue = await loadQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const retained: ProgressEntry[] = [];
  let flushed = 0;
  for (const entry of queue) {
    try {
      await putFn(entry);
      flushed += 1;
    } catch {
      retained.push(entry);
    }
  }

  await saveQueue(retained);
  return { flushed, remaining: retained.length };
}

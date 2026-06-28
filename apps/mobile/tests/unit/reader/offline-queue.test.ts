import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueueProgress,
  loadQueue,
  flushQueue,
  OFFLINE_QUEUE_KEY,
  type ProgressEntry,
} from '@/features/reader/lib/offline-queue';

const entryA: ProgressEntry = {
  readableKey: 'page:file:1',
  position: 0.25,
  locator: { page: 3 },
  at: 1000,
};
const entryB: ProgressEntry = {
  readableKey: 'audio:vol:2',
  position: 0.5,
  locator: { sec: 120 },
  at: 2000,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('offline-queue', () => {
  it('starts empty', async () => {
    expect(await loadQueue()).toEqual([]);
  });

  it('enqueueProgress appends entries in order', async () => {
    await enqueueProgress(entryA);
    await enqueueProgress(entryB);
    expect(await loadQueue()).toEqual([entryA, entryB]);
  });

  it('tolerates a corrupted blob (resets to empty)', async () => {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, 'not json{');
    expect(await loadQueue()).toEqual([]);
    await enqueueProgress(entryA);
    expect(await loadQueue()).toEqual([entryA]);
  });

  it('flushQueue drains the whole queue on success', async () => {
    await enqueueProgress(entryA);
    await enqueueProgress(entryB);

    const seen: ProgressEntry[] = [];
    const putFn = jest.fn(async (e: ProgressEntry) => {
      seen.push(e);
    });

    const result = await flushQueue(putFn);

    expect(putFn).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([entryA, entryB]);
    expect(result).toEqual({ flushed: 2, remaining: 0 });
    expect(await loadQueue()).toEqual([]);
  });

  it('flushQueue retains entries that fail, drops the ones that succeed', async () => {
    await enqueueProgress(entryA);
    await enqueueProgress(entryB);

    // First succeeds, second throws (simulating still-offline / server error).
    const putFn = jest.fn(async (e: ProgressEntry) => {
      if (e.readableKey === entryB.readableKey) throw new Error('offline');
    });

    const result = await flushQueue(putFn);

    expect(result).toEqual({ flushed: 1, remaining: 1 });
    expect(await loadQueue()).toEqual([entryB]);
  });

  it('flushQueue on an empty queue is a no-op', async () => {
    const putFn = jest.fn(async () => undefined);
    const result = await flushQueue(putFn);
    expect(putFn).not.toHaveBeenCalled();
    expect(result).toEqual({ flushed: 0, remaining: 0 });
  });
});

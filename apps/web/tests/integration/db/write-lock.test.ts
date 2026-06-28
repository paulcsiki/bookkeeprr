import { describe, expect, it } from 'vitest';
import { withWriteLock } from '@/server/db/write-lock';

describe('withWriteLock', () => {
  it('serializes concurrent calls', async () => {
    const events: string[] = [];
    const tasks = Array.from({ length: 5 }, (_, i) =>
      withWriteLock(async () => {
        events.push(`enter-${i}`);
        await new Promise((r) => setTimeout(r, 10));
        events.push(`leave-${i}`);
        return i;
      }),
    );
    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    for (let i = 0; i < 5; i++) {
      expect(events[i * 2]).toBe(`enter-${i}`);
      expect(events[i * 2 + 1]).toBe(`leave-${i}`);
    }
  });

  it('returns the value from the callback', async () => {
    const v = await withWriteLock(() => 42);
    expect(v).toBe(42);
  });

  it('propagates errors and releases the lock', async () => {
    await expect(
      withWriteLock(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const v = await withWriteLock(() => 'ok');
    expect(v).toBe('ok');
  });

  it('allows sync callbacks', async () => {
    const v = await withWriteLock(() => 'sync');
    expect(v).toBe('sync');
  });
});

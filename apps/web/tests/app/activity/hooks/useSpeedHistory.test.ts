import { beforeEach, describe, expect, it } from 'vitest';
import {
  pushSample,
  useSpeedHistory,
  __resetSpeedHistoryForTests,
} from '@/app/(app)/activity/hooks/useSpeedHistory';

beforeEach(() => {
  __resetSpeedHistoryForTests();
});

describe('useSpeedHistory', () => {
  it('starts empty', () => {
    const samples = useSpeedHistory();
    expect(samples).toHaveLength(0);
  });

  it('pushSample adds a sample', () => {
    pushSample(1024, 512);
    const samples = useSpeedHistory();
    expect(samples).toHaveLength(1);
    expect(samples[0]?.speed).toBe(1024);
    expect(samples[0]?.totalBytes).toBe(512);
  });

  it('preserves insertion order (oldest first)', () => {
    pushSample(100, 0);
    pushSample(200, 0);
    pushSample(300, 0);
    const samples = useSpeedHistory();
    expect(samples.map((s) => s.speed)).toEqual([100, 200, 300]);
  });

  it('bounds at 60 samples', () => {
    for (let i = 0; i < 70; i++) {
      pushSample(i, i * 100);
    }
    const samples = useSpeedHistory();
    expect(samples).toHaveLength(60);
    // Should keep the newest 60 (indices 10–69)
    expect(samples[0]?.speed).toBe(10);
    expect(samples[59]?.speed).toBe(69);
  });

  it('exactly 60 samples — no trimming', () => {
    for (let i = 0; i < 60; i++) {
      pushSample(i, 0);
    }
    const samples = useSpeedHistory();
    expect(samples).toHaveLength(60);
    expect(samples[0]?.speed).toBe(0);
    expect(samples[59]?.speed).toBe(59);
  });

  it('returns a copy — mutations do not affect internal state', () => {
    pushSample(42, 0);
    const samples = useSpeedHistory();
    // @ts-expect-error — intentional mutation of the returned copy
    samples[0] = { speed: 999, totalBytes: 0, timestamp: 0 };
    // The hook should return the original unmodified value
    expect(useSpeedHistory()[0]?.speed).toBe(42);
  });
});

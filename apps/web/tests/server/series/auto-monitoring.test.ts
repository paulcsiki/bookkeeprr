import { describe, expect, it } from 'vitest';
import { shouldAutoDisableFutureMonitoring } from '@/server/series/auto-monitoring';
import type { SeriesRow } from '@/server/db/schema';

type Facts = Pick<SeriesRow, 'monitoring' | 'status' | 'totalVolumes'>;
const facts = (over: Partial<Facts>): Facts => ({
  monitoring: 'future',
  status: 'releasing',
  totalVolumes: null,
  ...over,
});

describe('shouldAutoDisableFutureMonitoring', () => {
  it('only acts on future monitoring', () => {
    expect(shouldAutoDisableFutureMonitoring(facts({ monitoring: 'all', status: 'finished' }))).toBe(false);
    expect(shouldAutoDisableFutureMonitoring(facts({ monitoring: 'missing', totalVolumes: 1 }))).toBe(false);
    expect(shouldAutoDisableFutureMonitoring(facts({ monitoring: 'none', status: 'finished' }))).toBe(false);
  });

  it('drops future for finished or cancelled series', () => {
    expect(shouldAutoDisableFutureMonitoring(facts({ status: 'finished' }))).toBe(true);
    expect(shouldAutoDisableFutureMonitoring(facts({ status: 'cancelled' }))).toBe(true);
  });

  it('drops future for a single book (totalVolumes <= 1)', () => {
    expect(shouldAutoDisableFutureMonitoring(facts({ totalVolumes: 1 }))).toBe(true);
  });

  it('keeps future for an ongoing multi-volume series', () => {
    expect(shouldAutoDisableFutureMonitoring(facts({ status: 'releasing', totalVolumes: 12 }))).toBe(false);
    expect(shouldAutoDisableFutureMonitoring(facts({ status: 'hiatus', totalVolumes: null }))).toBe(false);
    // Unknown volume count on an ongoing series must NOT be treated as single.
    expect(shouldAutoDisableFutureMonitoring(facts({ status: 'releasing', totalVolumes: null }))).toBe(false);
  });
});

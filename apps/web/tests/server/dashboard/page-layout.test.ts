import { describe, expect, it } from 'vitest';
import {
  packRows,
  rowColumns,
  greetingFromHour,
  firstNameOf,
  periodFromQuery,
  relativeTime,
  DEFAULT_ORDER,
  type WidgetId,
} from '@/components/dashboard/page-layout';

describe('packRows', () => {
  it('packs the default order into the prototype row layout', () => {
    // continue(full) | personal(wide)+goals(rail) | leaderboard(wide)+format(rail)
    // | feed(wide)+releases(rail) | server(full) | recent(full)
    expect(packRows(DEFAULT_ORDER)).toEqual([
      ['continue'],
      ['personal', 'goals'],
      ['leaderboard', 'format'],
      ['feed', 'releases'],
      ['server'],
      ['recent'],
    ]);
  });

  it('gives every full-span widget its own row', () => {
    const order: WidgetId[] = ['continue', 'server', 'recent'];
    expect(packRows(order)).toEqual([['continue'], ['server'], ['recent']]);
  });

  it('pairs two consecutive non-full widgets', () => {
    expect(packRows(['personal', 'goals'])).toEqual([['personal', 'goals']]);
  });

  it('leaves a trailing non-full widget alone', () => {
    expect(packRows(['personal', 'goals', 'format'])).toEqual([
      ['personal', 'goals'],
      ['format'],
    ]);
  });

  it('does not pair across a full-span widget', () => {
    expect(packRows(['personal', 'server', 'goals'])).toEqual([
      ['personal'],
      ['server'],
      ['goals'],
    ]);
  });
});

describe('rowColumns', () => {
  it('splits a wide+rail pair 1.6/1', () => {
    expect(rowColumns('personal', 'goals')).toBe('1.6fr 1fr');
  });
  it('mirrors a rail+wide pair', () => {
    expect(rowColumns('goals', 'personal')).toBe('1fr 1.6fr');
  });
  it('splits evenly otherwise', () => {
    expect(rowColumns('personal', 'leaderboard')).toBe('1fr 1fr');
  });
});

describe('greetingFromHour', () => {
  it.each([
    [0, 'Late night'],
    [4, 'Late night'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('hour %i → %s', (hour, expected) => {
    expect(greetingFromHour(hour)).toBe(expected);
  });
});

describe('firstNameOf', () => {
  it('returns the first word', () => {
    expect(firstNameOf('Paul Avery')).toBe('Paul');
  });
  it('handles a single word', () => {
    expect(firstNameOf('paul')).toBe('paul');
  });
  it('falls back for an empty name', () => {
    expect(firstNameOf('   ')).toBe('there');
  });
});

describe('periodFromQuery', () => {
  it('defaults to week', () => {
    expect(periodFromQuery(undefined)).toBe('week');
    expect(periodFromQuery('bogus')).toBe('week');
  });
  it('accepts valid periods', () => {
    expect(periodFromQuery('month')).toBe('month');
    expect(periodFromQuery('year')).toBe('year');
    expect(periodFromQuery('all')).toBe('all');
  });
  it('takes the first of an array param', () => {
    expect(periodFromQuery(['year', 'week'])).toBe('year');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-06-05T12:00:00.000Z');
  it('formats sub-minute as just now', () => {
    expect(relativeTime(new Date('2026-06-05T11:59:30.000Z'), now)).toBe('just now');
  });
  it('formats minutes and hours', () => {
    expect(relativeTime(new Date('2026-06-05T11:30:00.000Z'), now)).toBe('30m ago');
    expect(relativeTime(new Date('2026-06-05T09:00:00.000Z'), now)).toBe('3h ago');
  });
  it('formats yesterday and days', () => {
    expect(relativeTime(new Date('2026-06-04T12:00:00.000Z'), now)).toBe('Yesterday');
    expect(relativeTime(new Date('2026-06-02T12:00:00.000Z'), now)).toBe('3d ago');
  });
  it('formats weeks', () => {
    expect(relativeTime(new Date('2026-05-22T12:00:00.000Z'), now)).toBe('2w ago');
  });
});

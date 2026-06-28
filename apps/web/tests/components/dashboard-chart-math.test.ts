import { describe, expect, it } from 'vitest';
import {
  donutGeometry,
  heatmapLevel,
  trendGeometry,
  ringProgress,
  buildHeatmapGrid,
} from '@/components/dashboard/chart-math';

describe('donutGeometry', () => {
  it('normalizes segments to fractions that sum to 1', () => {
    const g = donutGeometry(
      [
        { type: 'manga', value: 30 },
        { type: 'comic', value: 10 },
      ],
      150,
      20,
      0,
    );
    expect(g.empty).toBe(false);
    expect(g.arcs).toHaveLength(2);
    const sum = g.arcs.reduce((s, a) => s + a.fraction, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(g.arcs[0]!.pct).toBe(75);
    expect(g.arcs[1]!.pct).toBe(25);
  });

  it('accumulates offsets so arcs are laid end to end', () => {
    const g = donutGeometry(
      [
        { type: 'manga', value: 1 },
        { type: 'comic', value: 1 },
      ],
      150,
      20,
      0,
    );
    expect(g.arcs[0]!.offset).toBeCloseTo(0, 6);
    // second arc starts where the first ended (negative offset).
    expect(g.arcs[1]!.offset).toBeCloseTo(-(g.circumference / 2), 6);
  });

  it('drops zero/negative segments', () => {
    const g = donutGeometry(
      [
        { type: 'manga', value: 5 },
        { type: 'comic', value: 0 },
        { type: 'ebook', value: -3 },
      ],
      150,
      20,
    );
    expect(g.arcs.map((a) => a.type)).toEqual(['manga']);
    expect(g.arcs[0]!.pct).toBe(100);
  });

  it('reports empty when every segment is zero (hollow track)', () => {
    const g = donutGeometry(
      [
        { type: 'manga', value: 0 },
        { type: 'comic', value: 0 },
      ],
      150,
      20,
    );
    expect(g.empty).toBe(true);
    expect(g.arcs).toHaveLength(0);
    expect(g.radius).toBeCloseTo((150 - 20) / 2, 6);
  });

  it('trims each arc by the gap', () => {
    const g = donutGeometry([{ type: 'manga', value: 1 }], 150, 20, 2.5);
    expect(g.arcs[0]!.dash).toBeCloseTo(g.circumference - 2.5, 6);
  });
});

describe('heatmapLevel', () => {
  it('returns 0 for no activity or non-positive max', () => {
    expect(heatmapLevel(0, 10)).toBe(0);
    expect(heatmapLevel(5, 0)).toBe(0);
    expect(heatmapLevel(-1, 10)).toBe(0);
  });

  it('buckets the (0, max] range into quartiles', () => {
    expect(heatmapLevel(2, 8)).toBe(1); // 0.25
    expect(heatmapLevel(4, 8)).toBe(2); // 0.5
    expect(heatmapLevel(6, 8)).toBe(3); // 0.75
    expect(heatmapLevel(8, 8)).toBe(4); // 1.0
    expect(heatmapLevel(1, 8)).toBe(1);
    expect(heatmapLevel(5, 8)).toBe(3);
  });

  it('clamps values above max to level 4', () => {
    expect(heatmapLevel(20, 8)).toBe(4);
  });
});

describe('trendGeometry', () => {
  it('scales points into the 0..100 viewBox with an inverted y-axis', () => {
    const g = trendGeometry([0, 5, 10]);
    expect(g.points[0]!.x).toBe(0);
    expect(g.points[2]!.x).toBe(100);
    // first point is the min (0) → near the bottom (y close to 100).
    expect(g.points[0]!.y).toBe(100);
    // peak (10) padded 12% → not touching the top.
    expect(g.points[2]!.y).toBeGreaterThan(0);
    expect(g.flat).toBe(false);
    expect(g.last).toEqual(g.points[2]);
  });

  it('treats an all-zero series as flat', () => {
    const g = trendGeometry([0, 0, 0]);
    expect(g.flat).toBe(true);
  });

  it('treats a single point as flat', () => {
    const g = trendGeometry([7]);
    expect(g.flat).toBe(true);
    expect(g.points).toHaveLength(1);
  });

  it('handles an empty series with a mid baseline', () => {
    const g = trendGeometry([]);
    expect(g.flat).toBe(true);
    expect(g.last.y).toBe(50);
  });
});

describe('ringProgress', () => {
  it('computes the filled fraction and dash length', () => {
    const C = 100;
    expect(ringProgress(5, 10, C)).toEqual({ fraction: 0.5, dash: 50 });
    expect(ringProgress(0, 10, C)).toEqual({ fraction: 0, dash: 0 });
  });

  it('clamps over- and under-shoot', () => {
    const C = 100;
    expect(ringProgress(20, 10, C).fraction).toBe(1);
    expect(ringProgress(-5, 10, C).fraction).toBe(0);
  });

  it('returns 0 for a non-positive max', () => {
    expect(ringProgress(5, 0, 100)).toEqual({ fraction: 0, dash: 0 });
  });
});

describe('buildHeatmapGrid', () => {
  it('produces a weeks×7 column-major grid', () => {
    const { columns } = buildHeatmapGrid([], 53, '2026-06-05');
    expect(columns).toHaveLength(53);
    for (const col of columns) expect(col).toHaveLength(7);
  });

  it('levels each day against the busiest day and counts active days', () => {
    const { columns, max, activeDays } = buildHeatmapGrid(
      [
        { date: '2026-06-01', value: 4 },
        { date: '2026-06-03', value: 8 },
      ],
      53,
      '2026-06-05',
    );
    expect(max).toBe(8);
    expect(activeDays).toBe(2);
    const cells = columns.flat();
    const busiest = cells.find((c) => c.date === '2026-06-03');
    const half = cells.find((c) => c.date === '2026-06-01');
    expect(busiest?.level).toBe(4);
    expect(half?.level).toBe(2);
  });

  it('yields an all-zero track for empty input', () => {
    const { columns, max, activeDays } = buildHeatmapGrid([], 53, '2026-06-05');
    expect(max).toBe(0);
    expect(activeDays).toBe(0);
    expect(columns.flat().every((c) => c.level === 0)).toBe(true);
  });
});

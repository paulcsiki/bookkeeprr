/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CoverWall, coverWallGrid } from '@bookkeeprr/ui';

describe('CoverWall', () => {
  it('renders 7 columns × 8 tiles × 2 (duplicated for seamless loop) = 112 cover tiles by default', () => {
    const { container } = render(<CoverWall />);
    const tiles = container.querySelectorAll('.lcover');
    expect(tiles).toHaveLength(7 * 8 * 2);
  });

  it('honors custom cols and perCol', () => {
    const { container } = render(<CoverWall cols={3} perCol={4} />);
    expect(container.querySelectorAll('.lcover')).toHaveLength(3 * 4 * 2);
  });

  it('image src uses the local vendored cover path for the ISBN', () => {
    const { container } = render(<CoverWall cols={1} perCol={1} />);
    const img = container.querySelector('.lcover img');
    expect(img?.getAttribute('src')).toMatch(/^\/covers\/\d{13}\.webp$/);
  });

  // The wall is server-rendered and then hydrated on the client. A Math.random()
  // shuffle produced a different arrangement on each render, throwing a React
  // hydration mismatch. Two independent renders (standing in for server +
  // client) must produce an identical cover order.
  it('renders a deterministic cover order across renders (SSR-safe)', () => {
    const titles = (c: HTMLElement): string[] =>
      [...c.querySelectorAll('.ph')].map((el) => el.textContent ?? '');
    const a = render(<CoverWall />);
    const b = render(<CoverWall />);
    const seqA = titles(a.container);
    expect(seqA.length).toBeGreaterThan(0);
    expect(seqA).toEqual(titles(b.container));
  });
});

describe('coverWallGrid', () => {
  it('keeps the floors on small viewports', () => {
    const g = coverWallGrid(800, 600, 12, 10);
    expect(g.cols).toBe(12);
    expect(g.perCol).toBe(10);
  });

  it('grows past the floors to cover a large viewport', () => {
    const g = coverWallGrid(3840, 2160, 12, 10);
    expect(g.cols).toBeGreaterThan(12);
    expect(g.perCol).toBeGreaterThan(10);
  });

  it('sizes the tilt canvas to fit its columns and one row-set', () => {
    const g = coverWallGrid(1920, 1080, 12, 10);
    // tiltWidth = cols*150 + (cols-1)*20 ; tiltHeight = perCol*245
    expect(g.tiltWidth).toBe(g.cols * 150 + (g.cols - 1) * 20);
    expect(g.tiltHeight).toBe(g.perCol * 245);
  });

  it('is monotonic — a wider/taller viewport never needs fewer tiles', () => {
    const small = coverWallGrid(1280, 800, 7, 8);
    const big = coverWallGrid(2560, 1440, 7, 8);
    expect(big.cols).toBeGreaterThanOrEqual(small.cols);
    expect(big.perCol).toBeGreaterThanOrEqual(small.perCol);
  });

  it('caps the grid so a freak resolution cannot explode the DOM', () => {
    const g = coverWallGrid(15360, 8640, 12, 10);
    expect(g.cols).toBeLessThanOrEqual(48);
    expect(g.perCol).toBeLessThanOrEqual(24);
  });
});

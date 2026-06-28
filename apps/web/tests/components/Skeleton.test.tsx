/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonCard, SkeletonListRow, SkeletonHero } from '@bookkeeprr/ui';

describe('Skeleton', () => {
  it('renders the line variant by default', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/skel/);
    expect(el.className).toMatch(/skel-line/);
  });

  it('applies the chosen variant class', () => {
    const variants = ['cover', 'chip', 'circle'] as const;
    for (const v of variants) {
      const { container } = render(<Skeleton variant={v} />);
      const el = container.firstChild as HTMLElement;
      expect(el.className).toMatch(new RegExp(`skel-${v}`));
    }
  });

  it('applies width and height inline styles when provided', () => {
    const { container } = render(<Skeleton width={120} height={20} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('20px');
  });

  it('SkeletonCard renders a cover + two lines', () => {
    const { container } = render(<SkeletonCard />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/skel-card/);
    expect(root.querySelectorAll('.skel-cover')).toHaveLength(1);
    expect(root.querySelectorAll('.skel-line')).toHaveLength(2);
  });

  it('SkeletonListRow renders 6 grid cells', () => {
    const { container } = render(<SkeletonListRow />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/skel-listrow/);
    expect(root.children).toHaveLength(6);
  });

  it('SkeletonHero renders a cover plus a body block', () => {
    const { container } = render(<SkeletonHero />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/skel-hero/);
    expect(root.querySelectorAll('.skel-cover')).toHaveLength(1);
  });
});

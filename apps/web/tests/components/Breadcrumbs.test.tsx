/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Breadcrumbs } from '@bookkeeprr/ui';

describe('Breadcrumbs', () => {
  it('renders crumbs with the last one as current (unlinked)', () => {
    const { container } = render(
      <Breadcrumbs
        items={[
          { label: 'Library', href: '/library' },
          { label: 'Vinland Saga', current: true },
        ]}
      />,
    );
    expect(container.querySelector('a')?.textContent).toBe('Library');
    expect(container.querySelector('.crumb.current')?.textContent).toBe('Vinland Saga');
  });

  it('renders the home glyph when the first item has icon="home"', () => {
    const { container } = render(
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/', icon: 'home' },
          { label: 'Library', current: true },
        ]}
      />,
    );
    expect(container.querySelector('.crumb.home')).not.toBeNull();
    expect(container.querySelectorAll('.sep')).toHaveLength(1);
  });

  it('renders the content-type dot when contentType is provided', () => {
    const { container } = render(
      <Breadcrumbs
        items={[
          { label: 'Library', href: '/library' },
          { label: 'Manga', href: '/library?type=manga', contentType: 'manga' },
          { label: 'Vinland Saga', current: true },
        ]}
      />,
    );
    const dots = container.querySelectorAll('.ctype');
    expect(dots).toHaveLength(1);
  });

  it('applies the mono variant classes', () => {
    const { container } = render(
      <Breadcrumbs
        variant="mono"
        items={[
          { label: 'Calendar', href: '/calendar' },
          { label: 'May 14, 2026', current: true },
        ]}
      />,
    );
    const nav = container.querySelector('nav.bc');
    expect(nav?.className).toMatch(/mono/);
  });

  it('applies the plain variant (no pill bg)', () => {
    const { container } = render(
      <Breadcrumbs variant="plain" items={[{ label: 'Solo', current: true }]} />,
    );
    expect(container.querySelector('nav.bc')?.className).toMatch(/plain/);
  });

  it('collapses middle hops behind a … button and fires onExpand', () => {
    const onExpand = vi.fn();
    const { container } = render(
      <Breadcrumbs
        collapsedFrom={2}
        onExpand={onExpand}
        items={[
          { label: 'Home', href: '/', icon: 'home' },
          { label: 'Library', href: '/library' },
          { label: 'Manga', href: '/library?type=manga' },
          { label: 'Long-running', href: '/long' },
          { label: 'Volume 27', current: true },
        ]}
      />,
    );
    const collapse = container.querySelector('.collapse');
    expect(collapse).not.toBeNull();
    fireEvent.click(collapse!);
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});

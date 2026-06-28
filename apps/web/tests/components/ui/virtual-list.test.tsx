/** @vitest-environment jsdom */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualList } from '@/components/ui/virtual-list';

// @tanstack/react-virtual measures the scroll container via element.offsetHeight.
// jsdom always returns 0 for offsetHeight, so the virtualizer sees height=0 and
// renders no items. Override the property on HTMLElement.prototype to return 256
// (matching h-64 = 256px) so the virtualizer can calculate visible rows.
let originalOffsetHeight: PropertyDescriptor | undefined;
beforeAll(() => {
  originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return 256;
    },
  });
});
afterAll(() => {
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  }
});

type Item = { id: number; label: string };

function buildItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, label: `item-${i}` }));
}

describe('VirtualList', () => {
  it('renders only a subset of items (windowing works)', () => {
    const items = buildItems(1000);
    const { container } = render(
      <VirtualList
        items={items}
        estimateSize={() => 32}
        renderItem={(item) => <div data-testid="row">{item.label}</div>}
        className="h-64"
      />,
    );
    const rendered = container.querySelectorAll('[data-testid="row"]');
    // jsdom default viewport is 1024x768; container height is 256 (h-64), so visible
    // items ~= 256/32 = 8, plus overscan. Should be far less than 1000.
    expect(rendered.length).toBeLessThan(50);
    expect(rendered.length).toBeGreaterThan(0);
  });

  it('renderItem receives (item, index)', () => {
    const items = buildItems(10);
    const calls: Array<{ item: Item; index: number }> = [];
    render(
      <VirtualList
        items={items}
        estimateSize={() => 32}
        renderItem={(item, index) => {
          calls.push({ item, index });
          return <div data-testid="row">{item.label}</div>;
        }}
        className="h-64"
      />,
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]!.item.id).toBe(0);
    expect(calls[0]!.index).toBe(0);
  });

  it('renders the first item label visibly', () => {
    const items = buildItems(100);
    render(
      <VirtualList
        items={items}
        estimateSize={() => 32}
        renderItem={(item) => <div data-testid={`row-${item.id}`}>{item.label}</div>}
        className="h-64"
      />,
    );
    expect(screen.getByTestId('row-0')).toBeDefined();
  });
});

'use client';

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export type VirtualListProps<T> = {
  items: T[];
  estimateSize: (index: number) => number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  /** Optional key extractor; defaults to (_item, index) => index. */
  keyExtractor?: (item: T, index: number) => string | number;
  /**
   * When true, auto-scrolls to the last item whenever `items` changes — but only
   * if the user is already near the bottom, so scrolling up to read isn't
   * interrupted. Used for live "tail -f" style views.
   */
  stickToBottom?: boolean;
  /**
   * When true, each row is measured dynamically via `measureElement` so rows
   * with variable height (e.g. expandable panels) size themselves. `estimateSize`
   * is still used as the initial guess before measurement.
   */
  dynamicHeight?: boolean;
};

export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  overscan = 5,
  className,
  keyExtractor,
  stickToBottom = false,
  dynamicHeight = false,
}: VirtualListProps<T>): React.JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
  });

  // Stick to the bottom on content change when the user hasn't scrolled away.
  useEffect(() => {
    if (!stickToBottom || items.length === 0 || !atBottomRef.current) return;
    virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
  }, [stickToBottom, items, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      ref={parentRef}
      className={`overflow-y-auto ${className ?? ''}`}
      onScroll={(e) => {
        if (!stickToBottom) return;
        const el = e.currentTarget;
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
    >
      <div
        style={{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]!;
          const key = keyExtractor ? keyExtractor(item, virtualItem.index) : virtualItem.index;
          return (
            <div
              key={key}
              data-index={virtualItem.index}
              ref={dynamicHeight ? virtualizer.measureElement : undefined}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useContinueReading } from './hooks/useContinueReading';
import { ContinueCard } from './ContinueCard';

/**
 * The library's "Continue reading" rail — a horizontal scroll of
 * {@link ContinueCard}s seeded from `GET /api/reader/progress`. Renders nothing
 * at all when the user has no in-progress readables, so it stays out of the way
 * on a fresh library. Lives in the dark app shell (standard `--color-*`
 * tokens).
 */
export function ContinueReadingRail(): React.JSX.Element | null {
  const { data: items } = useContinueReading();

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Continue reading
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((item) => (
          <ContinueCard key={item.readableKey} item={item} />
        ))}
      </div>
    </section>
  );
}

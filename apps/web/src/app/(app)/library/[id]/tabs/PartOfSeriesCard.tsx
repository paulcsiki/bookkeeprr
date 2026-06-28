'use client';

import Link from 'next/link';
import { Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContentTypePill } from '@/components/ContentTypePill';
import type { BookSeriesRow } from '@/server/db/schema';

type BookSeriesCardProps = {
  bookSeries: BookSeriesRow & { memberCount: number };
};

export function PartOfSeriesCard({ bookSeries }: BookSeriesCardProps): React.JSX.Element {
  return (
    <div
      data-testid="part-of-series-card"
      className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
    >
      <Library className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="font-display text-sm font-semibold truncate">{bookSeries.name}</p>
        <ContentTypePill type={bookSeries.contentType} />
        <span className="font-mono text-[11px] text-muted-foreground shrink-0">
          {bookSeries.memberCount} {bookSeries.memberCount === 1 ? 'title' : 'titles'}
        </span>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link
          href={`/library/series/${bookSeries.id}`}
          data-testid="part-of-series-view"
        >
          View
        </Link>
      </Button>
    </div>
  );
}

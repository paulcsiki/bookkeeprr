'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Cover } from '@/components/Cover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ContentType } from '@/server/content-type';
import type { CalendarEntry } from '@/server/db/calendar';
import {
  type DayBucket,
  DOW,
  TYPE_LABEL,
  TYPE_VAR,
  addMonthsUtc,
  bucketByDay,
  formatMonthHeading,
  monthGridDays,
  monthKey,
  parseMonthKey,
  startOfMonthUtc,
  todayUtc,
  ymd,
} from './lib';

const TYPE_ORDER: readonly ContentType[] = ['manga', 'light_novel', 'comic', 'ebook', 'audiobook'];

type Props = {
  entries: CalendarEntry[];
  monthIso: string;
};

export function MonthGrid({ entries, monthIso }: Props): React.JSX.Element {
  const monthStart = parseMonthKey(monthIso);
  const today = todayUtc();
  const todayStr = ymd(today);
  const days = useMemo(() => monthGridDays(monthStart), [monthStart]);
  const buckets = useMemo(() => bucketByDay(entries), [entries]);
  const [hover, setHover] = useState<string | null>(null);

  const prevMonth = monthKey(addMonthsUtc(monthStart, -1));
  const nextMonth = monthKey(addMonthsUtc(monthStart, 1));
  const todayMonth = monthKey(startOfMonthUtc(today));
  const totalThisMonth = entries.filter((e) => e.date.startsWith(monthIso)).length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-elevated px-6 py-4">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {formatMonthHeading(monthStart)}
        </h2>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm" aria-label="Previous month">
            <Link href={{ pathname: '/calendar', query: { month: prevMonth } }}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={{ pathname: '/calendar', query: { month: todayMonth } }}>Today</Link>
          </Button>
          <Button asChild variant="secondary" size="sm" aria-label="Next month">
            <Link href={{ pathname: '/calendar', query: { month: nextMonth } }}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <span className="ml-3 font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
            {totalThisMonth} release{totalThisMonth === 1 ? '' : 's'} this month
          </span>
        </div>
      </div>

      {/* DOW bar */}
      <div className="grid grid-cols-7 border-b border-border bg-elevated py-2.5 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7" style={{ gridAutoRows: 'minmax(112px, auto)' }}>
        {days.map((d, idx) => {
          const dayStr = ymd(d);
          const inMonth = d.getUTCMonth() === monthStart.getUTCMonth();
          const bucket = buckets.get(dayStr);
          const isToday = dayStr === todayStr;
          const isHover = hover === dayStr;
          const hasReleases = !!bucket && bucket.entries.length > 0;
          const isRightCol = (idx + 1) % 7 === 0;

          if (!inMonth) {
            return (
              <div
                key={dayStr}
                className={cn(
                  'relative border-b border-border bg-sunken p-2.5',
                  !isRightCol && 'border-r',
                )}
                aria-hidden
              />
            );
          }

          const cell = (
            <>
              {isToday && (
                <span
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundColor: 'color-mix(in oklab, var(--color-primary) 16%, transparent)',
                  }}
                />
              )}
              <span
                className={cn(
                  'relative font-mono text-[11.5px] tracking-[0.02em]',
                  isToday ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {d.getUTCDate()}
                {isToday && ' · today'}
              </span>

              {hasReleases && (
                <div className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                  {bucket!.entries.slice(0, 2).map((e) => (
                    <div
                      key={e.volumeId}
                      className="flex items-center gap-1.5 overflow-hidden rounded border border-border bg-elevated-2 px-1.5 py-[3px] text-[11px] text-foreground/85"
                    >
                      <span
                        className="h-1 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: `var(${TYPE_VAR[e.contentType]})` }}
                      />
                      <span className="truncate">
                        {e.seriesTitle} · v{e.volumeNumber}
                      </span>
                    </div>
                  ))}
                  {bucket!.entries.length > 2 && (
                    <span className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-primary">
                      + {bucket!.entries.length - 2} more →
                    </span>
                  )}
                </div>
              )}

              {/* Hover popover */}
              {isHover && hasReleases && (
                <DayHoverPopover bucket={bucket!} anchorRight={isRightCol || (idx + 1) % 7 >= 5} />
              )}
            </>
          );

          const className = cn(
            'group relative flex min-h-0 flex-col gap-1.5 p-2.5',
            !isRightCol && 'border-r border-border',
            'border-b border-border',
            hasReleases && 'cursor-pointer hover:bg-hover',
          );

          if (hasReleases) {
            return (
              <Link
                key={dayStr}
                href={`/calendar/${dayStr}` as const}
                className={className}
                onMouseEnter={() => setHover(dayStr)}
                onMouseLeave={() => setHover((h) => (h === dayStr ? null : h))}
                aria-label={`${bucket!.entries.length} release${bucket!.entries.length === 1 ? '' : 's'} on ${dayStr}`}
              >
                {cell}
              </Link>
            );
          }

          return (
            <div key={dayStr} className={className}>
              {cell}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-elevated px-6 py-3 font-mono text-[10.5px] uppercase tracking-[0.10em] text-muted-foreground">
        <span>Content types</span>
        {TYPE_ORDER.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: `var(${TYPE_VAR[t]})` }}
            />
            {TYPE_LABEL[t]}
          </span>
        ))}
      </div>
    </div>
  );
}

function DayHoverPopover({
  bucket,
  anchorRight,
}: {
  bucket: DayBucket;
  anchorRight: boolean;
}): React.JSX.Element {
  const preview = bucket.entries.slice(0, 5);
  const extra = bucket.entries.length - preview.length;
  return (
    // Outer wrapper carries a transparent top padding that bridges the gap
    // between the cell and the popover so onMouseLeave on the parent Link
    // doesn't fire when the cursor traverses it.
    <div
      className={cn('absolute top-full z-30 w-72 pt-2', anchorRight ? 'right-0' : 'left-0')}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-lg border border-border bg-popover p-3 shadow-2xl shadow-black/40">
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.10em] text-muted-foreground">
          {bucket.entries.length} release{bucket.entries.length === 1 ? '' : 's'}
        </div>
        <div className="space-y-2">
          {preview.map((e) => (
            <div key={e.volumeId} className="flex gap-2.5">
              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded border border-border bg-muted">
                <Cover
                  className="absolute inset-0"
                  src={e.coverUrl}
                  contentType={e.contentType}
                  title={e.seriesTitle}
                  alt=""
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[12.5px] font-medium leading-snug">
                  {e.seriesTitle}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <span
                    className="h-1 w-1 rounded-full"
                    style={{ backgroundColor: `var(${TYPE_VAR[e.contentType]})` }}
                  />
                  <span>v{e.volumeNumber}</span>
                  {e.author && <span className="truncate">· {e.author}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <Link
          href={`/calendar/${bucket.date}` as const}
          className="mt-3 block border-t border-border pt-2.5 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-primary hover:underline"
        >
          View all {extra > 0 ? `${bucket.entries.length} ` : ''}releases →
        </Link>
      </div>
    </div>
  );
}

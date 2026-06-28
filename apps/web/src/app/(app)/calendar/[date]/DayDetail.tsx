'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ContentTypePill } from '@/components/ContentTypePill';
import { Cover } from '@/components/Cover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ContentType } from '@/server/content-type';
import type { CalendarEntry } from '@/server/db/calendar';
import { TYPE_LABEL } from '../lib';

type Filter = 'all' | ContentType;

const FILTER_ORDER: readonly ContentType[] = [
  'manga',
  'light_novel',
  'comic',
  'ebook',
  'audiobook',
];

type Props = {
  entries: CalendarEntry[];
};

export function DayDetail({ entries }: Props): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    const m = new Map<ContentType, number>();
    for (const e of entries) m.set(e.contentType, (m.get(e.contentType) ?? 0) + 1);
    return m;
  }, [entries]);

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.contentType === filter)),
    [entries, filter],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-7 py-3.5">
        <FilterPill
          label={`All · ${entries.length}`}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          variant="primary"
        />
        {FILTER_ORDER.map((t) => {
          const n = counts.get(t) ?? 0;
          if (n === 0) return null;
          return (
            <FilterPill
              key={t}
              label={`${TYPE_LABEL[t]} · ${n}`}
              active={filter === t}
              onClick={() => setFilter(t)}
            />
          );
        })}
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          Sorted by · series
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-7 py-16 text-center font-mono text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
          No releases on this day
        </div>
      ) : (
        <ul className="py-2">
          {filtered.map((e) => (
            <ReleaseRow key={e.volumeId} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  variant,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: 'primary';
}): React.JSX.Element {
  const isPrimaryActive = active && variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center rounded-full border px-3 font-mono text-[11px] uppercase tracking-[0.10em] transition-colors',
        isPrimaryActive
          ? 'border-transparent bg-primary text-primary-foreground'
          : active
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:border-input hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function MonitorStatus({
  monitoring,
}: {
  monitoring: CalendarEntry['monitoring'];
}): React.JSX.Element {
  if (monitoring === 'none') {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: 'var(--color-warn)' }}
        />
        Not monitored
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-ok)' }} />
      Monitored · {monitoring}
    </span>
  );
}

function ReleaseRow({ entry }: { entry: CalendarEntry }): React.JSX.Element {
  const byline = [entry.author, entry.publisher].filter(Boolean).join(' · ');
  return (
    <li>
      <Link
        href={`/library/${entry.seriesId}` as const}
        className="grid grid-cols-[58px_1fr_auto] items-center gap-5 border-t border-border px-7 py-3.5 first:border-t-0 hover:bg-hover"
      >
        <div className="relative aspect-[2/3] w-[58px] overflow-hidden rounded-md border border-border bg-muted">
          <Cover
            className="absolute inset-0"
            src={entry.coverUrl}
            contentType={entry.contentType}
            title={entry.seriesTitle}
            alt=""
          />
        </div>
        <div className="min-w-0">
          <div className="font-display text-base font-semibold leading-tight tracking-tight">
            {entry.seriesTitle}{' '}
            <span className="text-muted-foreground">· v{entry.volumeNumber}</span>
          </div>
          {byline && (
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              {byline}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <ContentTypePill type={entry.contentType} />
            <MonitorStatus monitoring={entry.monitoring} />
            {entry.volumeTitle && (
              <span className="truncate text-[12px] text-foreground/70">{entry.volumeTitle}</span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" tabIndex={-1}>
          View
        </Button>
      </Link>
    </li>
  );
}

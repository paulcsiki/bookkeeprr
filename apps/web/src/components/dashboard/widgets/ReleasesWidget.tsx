import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { Card, CardHead } from '@/components/dashboard';
import { Cover } from '@/components/Cover';
import { ContentTypePill } from '@/components/ContentTypePill';
import { WidgetEmpty } from './WidgetEmpty';
import type { ReleaseItem } from '../../../app/(app)/dashboard/data';

/**
 * Upcoming-releases peek: the next monitored volumes/issues, each with a cover,
 * type pill, detail, and a date/"Tomorrow" label. Empty → "No upcoming releases"
 * prompting Discover.
 */
export function ReleasesWidget({ items }: { items: ReleaseItem[] }): React.JSX.Element {
  return (
    <Card fill>
      <CardHead
        icon={CalendarDays}
        title="Upcoming releases"
        action={
          items.length > 0 ? (
            <Link href="/calendar" className="text-[12.5px] font-medium text-primary">
              See all →
            </Link>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <WidgetEmpty
          variant="primary"
          icon={<CalendarDays />}
          title="No upcoming releases"
          body="New volumes and issues for series you monitor will land here."
          cta={{ label: 'Discover series', href: '/discover' }}
          minHeight={184}
        />
      ) : (
        <div className="flex flex-col">
          {items.map((r, i) => (
            <Link
              key={r.volumeId}
              href={`/library/${r.seriesId}`}
              className={`flex items-center gap-3 py-[9px] ${i ? 'border-t border-border' : ''}`}
            >
              <div className="aspect-[2/3] w-[34px] shrink-0 overflow-hidden rounded border border-border bg-muted">
                <Cover
                  className="size-full"
                  src={r.coverUrl}
                  contentType={r.contentType}
                  title={r.title}
                  alt=""
                  hideType
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">{r.title}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <ContentTypePill type={r.contentType} />
                  <span className="truncate font-mono text-[9.5px] text-muted-foreground">
                    {r.detail}
                  </span>
                </div>
              </div>
              <div
                className="shrink-0 font-mono text-[11px] font-medium"
                style={{ color: r.soon ? 'var(--color-primary)' : 'var(--color-foreground)' }}
              >
                {r.whenLabel}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

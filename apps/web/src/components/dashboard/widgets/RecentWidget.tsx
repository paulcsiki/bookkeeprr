import Link from 'next/link';
import { Plus } from 'lucide-react';
import { SectionHead, MiniBook } from '@/components/dashboard';
import { WidgetEmpty } from './WidgetEmpty';
import type { RecentItem } from '../../../app/(app)/dashboard/data';

/**
 * Recently-added rail: the newest series in the library. Empty library is the
 * first-run hero — "Your library is empty" → Add from Discover.
 */
export function RecentWidget({ items }: { items: RecentItem[] }): React.JSX.Element {
  return (
    <section>
      <SectionHead
        icon={Plus}
        title="Recently added"
        action={
          items.length > 0 ? (
            <Link href="/library" className="text-[12.5px] font-medium text-primary">
              See all →
            </Link>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <WidgetEmpty
          variant="primary"
          icon={<Plus />}
          title="Your library is empty"
          body="Add your first series from Discover and it'll appear here."
          cta={{ label: 'Add from Discover', href: '/discover' }}
          minHeight={184}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-1.5">
          {items.map((b) => (
            <div key={b.seriesId} className="shrink-0" style={{ width: 120 }}>
              <MiniBook
                item={{
                  title: b.title,
                  contentType: b.contentType,
                  coverUrl: b.coverUrl,
                  sub: b.author,
                }}
                href={`/library/${b.seriesId}`}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

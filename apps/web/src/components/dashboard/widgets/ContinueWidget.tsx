import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { SectionHead, MiniBook } from '@/components/dashboard';
import type { ContinueItem } from '../../../app/(app)/dashboard/data';
import { WidgetEmpty } from './WidgetEmpty';

/**
 * Continue-reading rail: a horizontal scroll of in-progress titles with their
 * progress overlaid. Empty install keeps the section header and shows the
 * "Nothing in progress" prompt linking to the library.
 */
export function ContinueWidget({ items }: { items: ContinueItem[] }): React.JSX.Element {
  return (
    <section>
      <SectionHead
        icon={BookOpen}
        title="Continue reading"
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
          icon={<BookOpen />}
          title="Nothing in progress"
          body="Open a title from your library and your place will show up here."
          cta={{ label: 'Browse library', href: '/library' }}
          minHeight={184}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-1.5">
          {items.map((b) => (
            <div key={b.readableKey} className="shrink-0" style={{ width: 138 }}>
              <MiniBook
                item={{ title: b.title, contentType: b.contentType, coverUrl: b.coverUrl }}
                progress={b.pct}
                href={b.readerHref ?? `/library/${b.seriesId}`}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

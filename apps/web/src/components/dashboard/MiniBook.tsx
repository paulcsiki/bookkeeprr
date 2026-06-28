import type { ContentType } from '@bookkeeprr/types';
import { Cover } from '@/components/Cover';
import { ContentTypePill } from '@/components/ContentTypePill';
import { cn } from '@/lib/utils';

export type MiniBookItem = {
  title: string;
  contentType: ContentType;
  coverUrl?: string | null;
  /** Secondary line (author / volume). Defaults to nothing. */
  sub?: string | null;
};

type Props = {
  item: MiniBookItem;
  /** Reading progress 0..100; when set, paints an overlay bar on the cover. */
  progress?: number;
  /** Makes the whole tile a link. */
  href?: string;
  className?: string;
};

/**
 * A small cover tile with title + sub-line and an optional progress overlay —
 * the building block of the continue-reading / recently-finished rails. Wraps
 * the real `<Cover>` (tinted fallback) and `<ContentTypePill>`.
 */
export function MiniBook({ item, progress, href, className }: Props): React.JSX.Element {
  const pct = progress != null ? Math.round(Math.max(0, Math.min(100, progress))) : null;

  const inner = (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-muted">
        <Cover
          className="absolute inset-0"
          src={item.coverUrl}
          contentType={item.contentType}
          title={item.title}
          alt=""
          hideType
        />
        <span className="absolute top-2 left-2 z-[3]">
          <ContentTypePill type={item.contentType} />
        </span>
        {pct != null && (
          <div className="absolute inset-x-0 bottom-0 z-[3] h-1 bg-foreground/20">
            <div
              data-testid="minibook-progress"
              className="h-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium leading-tight text-foreground">
          {item.title}
        </div>
        {item.sub && (
          <div className="mt-0.5 truncate font-mono text-[9.5px] tracking-[0.02em] text-muted-foreground">
            {item.sub}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

'use client';

import Link from 'next/link';
import { parseReadableKey } from '@bookkeeprr/types';
import { isContentType } from '@bookkeeprr/types';
import { ContentTypePill } from '@/components/ContentTypePill';
import { Cover } from '@/components/Cover';
import { cn } from '@/lib/utils';
import type { ContinueReadingItem } from './hooks/useContinueReading';

type Props = { item: ContinueReadingItem };

/**
 * Resolve the reader route for a continue-reading item. Paged readables open
 * at `/read/f/<libraryFileId>`, audio volumes at `/read/v/<volumeId>`. We trust
 * the `readableKey` first (it's the canonical address) and fall back to the
 * row's `libraryFileId` / `volumeId` columns when the key can't be parsed.
 */
function readerHref(item: ContinueReadingItem): string | null {
  try {
    const parsed = parseReadableKey(item.readableKey);
    if (parsed.kind === 'page') return `/read/f/${parsed.fileId}`;
    return `/read/v/${parsed.volumeId}`;
  } catch {
    if (item.libraryFileId != null) return `/read/f/${item.libraryFileId}`;
    if (item.volumeId != null) return `/read/v/${item.volumeId}`;
    return null;
  }
}

/**
 * One card in the library's "Continue reading" rail. Lives inside the dark app
 * shell, so every color comes from the standard `--color-*` tokens (NOT the
 * reader `--reader-*` tokens). Shows the cover (or a token gradient fallback),
 * a content-type pill, the title, a progress bar + mono percentage, and a
 * FINISHED · STARTS OVER state when the readable was completed.
 */
export function ContinueCard({ item }: Props): React.JSX.Element {
  const href = readerHref(item);
  const pct = Math.round(Math.max(0, Math.min(1, item.position)) * 100);
  const title = item.title ?? 'Untitled';
  const type = isContentType(item.contentType) ? item.contentType : null;

  const inner = (
    <>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-muted">
        <Cover
          className="absolute inset-0"
          src={item.coverUrl}
          contentType={type ?? 'manga'}
          title={title}
          alt=""
          hideType
        />

        {type && (
          <span className="absolute top-2 left-2 z-[3]">
            <ContentTypePill type={type} />
          </span>
        )}

        {item.finished && (
          <div className="absolute inset-0 z-[3] grid place-items-center bg-background/55">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground">
              Read again
            </span>
          </div>
        )}

        {/* progress overlay bar */}
        <div className="absolute inset-x-0 bottom-0 z-[3] h-1 bg-foreground/20">
          <div
            data-testid="continue-progress-fill"
            className={cn('h-full', item.finished ? 'bg-[var(--color-ok)]' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-2.5">
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
          {item.finished ? 'FINISHED · STARTS OVER' : `${pct}%`}
        </div>
      </div>
    </>
  );

  const className = 'block w-[150px] flex-shrink-0';

  if (!href) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <Link href={href} className={cn(className, 'group transition hover:opacity-90')}>
      {inner}
    </Link>
  );
}

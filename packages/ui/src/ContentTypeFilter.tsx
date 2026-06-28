'use client';

import { cn } from './utils';
import type { ContentType } from '@bookkeeprr/types';

export type ContentTypeFilterValue = ContentType | 'all';

type Props = {
  counts: Record<ContentType, number>;
  selected: ContentTypeFilterValue;
  onSelect: (value: ContentTypeFilterValue) => void;
  className?: string;
  /**
   * When set, every chip stays enabled regardless of count, and counts are not
   * rendered. Used where the filter is a pure type selector (e.g. the Discover
   * browse rails, which fetch one type at a time and so cannot know all counts).
   */
  selectorOnly?: boolean;
};

const ORDER: ContentType[] = ['manga', 'light_novel', 'comic', 'ebook', 'audiobook'];

const LABEL: Record<ContentTypeFilterValue, string> = {
  all: 'All',
  manga: 'Manga',
  light_novel: 'Novel',
  comic: 'Comic',
  ebook: 'eBook',
  audiobook: 'Audio',
};

const CLASS: Record<ContentTypeFilterValue, string> = {
  all: 'all',
  manga: 'manga',
  light_novel: 'novel',
  comic: 'comic',
  ebook: 'ebook',
  audiobook: 'audio',
};

/**
 * Canonical content-type filter row from the 2026-05-30 design refresh
 * (`.ctf` in `docs/design/bookkeeprr-design-system.html` lines 507-536).
 *
 * Inactive chips are neutral; hovering previews the type's accent at 8%
 * fill / 30% border; the active chip lights up at 16% fill / 40% border
 * in its own accent. Zero-count chips are dimmed and non-interactive.
 *
 * The "All" chip uses `--color-primary` instead of a type accent.
 */
export function ContentTypeFilter({
  counts,
  selected,
  onSelect,
  className,
  selectorOnly = false,
}: Props): React.JSX.Element {
  const total = ORDER.reduce((sum, t) => sum + (counts[t] ?? 0), 0);
  const all: Array<{ key: ContentTypeFilterValue; count: number }> = [
    { key: 'all', count: total },
    ...ORDER.map((t) => ({ key: t as ContentTypeFilterValue, count: counts[t] ?? 0 })),
  ];

  return (
    <div className={cn('ctf', className)} role="group" aria-label="Filter by content type">
      {all.map(({ key, count }) => {
        const isOn = selected === key;
        const isZero = !selectorOnly && key !== 'all' && count === 0 && !isOn;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isOn}
            disabled={isZero}
            onClick={() => {
              if (!isZero) onSelect(key);
            }}
            className={cn('chip', CLASS[key], isOn && 'on', isZero && 'zero')}
          >
            <span>{LABEL[key]}</span>
            {selectorOnly ? null : <span className="n">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

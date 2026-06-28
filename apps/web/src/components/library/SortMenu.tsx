'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpNarrowWide, Check, ChevronDown } from 'lucide-react';

export type SortKey = 'recently_added' | 'oldest' | 'title_az' | 'title_za' | 'media_type';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recently_added', label: 'Recently added' },
  { key: 'oldest', label: 'Date added · oldest' },
  { key: 'title_az', label: 'Title · A–Z' },
  { key: 'title_za', label: 'Title · Z–A' },
  { key: 'media_type', label: 'Media type' },
];

export const DEFAULT_SORT: SortKey = 'recently_added';

type Props = {
  value: SortKey;
  onChange: (key: SortKey) => void;
  /** True when another popover (the filter funnel) is open; closes this one. */
  forceClosed?: boolean;
  /** Called when this menu opens, so the parent can close sibling popovers. */
  onOpen?: () => void;
};

/**
 * Sort dropdown — compact 34px trigger (sort icon + current value + chevron),
 * single-choice, closes on selection. Tints primary when sort != default.
 * Source: docs/design/bookkeeprr-design-system.html lines 2501-2508.
 */
export function SortMenu({ value, onChange, forceClosed, onOpen }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentLabel = SORT_OPTIONS.find((o) => o.key === value)?.label ?? 'Recently added';
  const active = value !== DEFAULT_SORT;

  useEffect(() => {
    if (forceClosed) setOpen(false);
  }, [forceClosed]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  function toggle(): void {
    setOpen((v) => {
      const next = !v;
      if (next) onOpen?.();
      return next;
    });
  }

  function handleSelect(key: SortKey): void {
    onChange(key);
    setOpen(false);
  }

  return (
    <div
      ref={ref}
      className={`filter-dd lib-sort-dd${open ? ' open' : ''}${active ? ' active' : ''}`}
    >
      <button
        type="button"
        className="filter-trigger sort-trigger"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Sort library"
        title="Sort"
      >
        <ArrowUpNarrowWide className="ico" width={16} height={16} strokeWidth={1.7} aria-hidden />
        <span className="sort-val">{currentLabel}</span>
        <ChevronDown className="chev" width={13} height={13} strokeWidth={1.7} aria-hidden />
      </button>
      {open && (
        <div className="popover filter-menu sort-menu" role="listbox">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="option"
              aria-selected={opt.key === value}
              className={`row${opt.key === value ? ' sel' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(opt.key);
              }}
            >
              <span className="tick">
                <Check width={11} height={11} strokeWidth={2.4} aria-hidden />
              </span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Filter } from 'lucide-react';

export type ReadFacet = 'all' | 'unfinished' | 'unread' | 'reading' | 'finished';
export type MonFacet = 'all' | 'monitored' | 'unmonitored';
export type HealthFacet = 'all' | 'complete' | 'missing' | 'downloading' | 'error';

export type LibraryFacets = {
  read: ReadFacet;
  mon: MonFacet;
  health: HealthFacet;
};

type Option<T extends string> = { value: T; label: string };

const READ_OPTIONS: Option<ReadFacet>[] = [
  { value: 'all', label: 'All' },
  { value: 'unfinished', label: 'Unfinished' },
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'In progress' },
  { value: 'finished', label: 'Finished' },
];

const MON_OPTIONS: Option<MonFacet>[] = [
  { value: 'all', label: 'All' },
  { value: 'monitored', label: 'Monitored' },
  { value: 'unmonitored', label: 'Unmonitored' },
];

const HEALTH_OPTIONS: Option<HealthFacet>[] = [
  { value: 'all', label: 'All' },
  { value: 'complete', label: 'Complete' },
  { value: 'missing', label: 'Missing' },
  { value: 'downloading', label: 'Downloading' },
  { value: 'error', label: 'Error' },
];

export type FacetCounts = {
  read: Record<ReadFacet, number>;
  mon: Record<MonFacet, number>;
  health: Record<HealthFacet, number>;
};

type Props = {
  facets: LibraryFacets;
  counts: FacetCounts;
  onSelectRead: (v: ReadFacet) => void;
  onSelectMon: (v: MonFacet) => void;
  onSelectHealth: (v: HealthFacet) => void;
  onClear: () => void;
  /** True when another popover (the sort menu) is open; closes this one. */
  forceClosed?: boolean;
  /** Called when this menu opens, so the parent can close sibling popovers. */
  onOpen?: () => void;
};

/**
 * Funnel filter button + grouped popover (Reading / Monitoring / Health).
 * Each group is single-select. The popover STAYS OPEN across selections so
 * multiple facets can be set in one pass. Tints primary when any facet is
 * active and shows a count badge of the number of active facets.
 * Source: docs/design/bookkeeprr-design-system.html lines 2493-2500, 6577-6612.
 */
export function LibraryFilterMenu({
  facets,
  counts,
  onSelectRead,
  onSelectMon,
  onSelectHealth,
  onClear,
  forceClosed,
  onOpen,
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeCount =
    (facets.read !== 'all' ? 1 : 0) +
    (facets.mon !== 'all' ? 1 : 0) +
    (facets.health !== 'all' ? 1 : 0);
  const active = activeCount > 0;

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

  function row<T extends string>(
    facet: keyof LibraryFacets,
    opt: Option<T>,
    current: T,
    count: number,
    onSelect: (v: T) => void,
  ): React.JSX.Element {
    const sel = current === opt.value;
    return (
      <button
        key={`${facet}-${opt.value}`}
        type="button"
        role="menuitemradio"
        aria-checked={sel}
        className={`row${sel ? ' sel' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(opt.value);
        }}
      >
        <span className="tick">
          <Check width={11} height={11} strokeWidth={2.4} aria-hidden />
        </span>
        <span>{opt.label}</span>
        <span className="key">{count}</span>
      </button>
    );
  }

  return (
    <div className={`filter-dd lib-filter-single${open ? ' open' : ''}${active ? ' active' : ''}`} ref={ref}>
      <button
        type="button"
        className="filter-trigger filter-icon-btn"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Filter library"
        title="Filter"
      >
        <Filter className="ico" width={16} height={16} strokeWidth={1.7} aria-hidden />
        {active && (
          <span className="filter-count" aria-hidden>
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="popover filter-menu filter-menu-combined" role="menu">
          <div className="grp-label">Reading</div>
          {READ_OPTIONS.map((opt) =>
            row('read', opt, facets.read, counts.read[opt.value], onSelectRead),
          )}
          <div className="sep" />
          <div className="grp-label">Monitoring</div>
          {MON_OPTIONS.map((opt) =>
            row('mon', opt, facets.mon, counts.mon[opt.value], onSelectMon),
          )}
          <div className="sep" />
          <div className="grp-label">Health</div>
          {HEALTH_OPTIONS.map((opt) =>
            row('health', opt, facets.health, counts.health[opt.value], onSelectHealth),
          )}
          {active && (
            <>
              <div className="sep" />
              <button
                type="button"
                className="row clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
              >
                <span className="tick" />
                <span>Clear filters</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

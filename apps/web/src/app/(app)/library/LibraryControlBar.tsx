'use client';

import { useState } from 'react';
import { LayoutGrid, List, Search } from 'lucide-react';
import { ContentTypeFilter, type ContentTypeFilterValue } from '@bookkeeprr/ui';
import { SortMenu, type SortKey } from '@/components/library/SortMenu';
import {
  LibraryFilterMenu,
  type FacetCounts,
  type HealthFacet,
  type LibraryFacets,
  type MonFacet,
  type ReadFacet,
} from '@/components/library/LibraryFilterMenu';
import type { ContentType } from '@bookkeeprr/types';

type Props = {
  /** Library title (e.g. "Library") */
  title: string;
  /** Subtitle line, e.g. "214 series — 38 monitored" */
  subtitle?: string;
  /** Live search query */
  search: string;
  onSearchChange: (q: string) => void;
  /** Grid or list view */
  view: 'grid' | 'list';
  onViewChange: (v: 'grid' | 'list') => void;
  /** Active sort key */
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
  /** Active content-type filter */
  typeFilter: ContentTypeFilterValue;
  onTypeFilterChange: (v: ContentTypeFilterValue) => void;
  /** Per-type counts for the ContentTypeFilter chips */
  counts: Record<ContentType, number>;
  /** Reading/monitoring/health facet state + handlers */
  facets: LibraryFacets;
  facetCounts: FacetCounts;
  onReadChange: (v: ReadFacet) => void;
  onMonChange: (v: MonFacet) => void;
  onHealthChange: (v: HealthFacet) => void;
  onClearFacets: () => void;
  /** Optional trailing actions in the header (e.g. Rename all). */
  actions?: React.ReactNode;
  /** "New group" trigger + popover — rendered before the filter/sort triggers. */
  newGroupSlot?: React.ReactNode;
};

/**
 * Library page header: top row (title + search + view tabs + Add-new),
 * and second row (ContentTypeFilter on the left + funnel filter + sort
 * dropdown on the right) — matching design HTML lines 2484-2510.
 */
export function LibraryControlBar({
  title,
  subtitle,
  search,
  onSearchChange,
  view,
  onViewChange,
  sortKey,
  onSortChange,
  typeFilter,
  onTypeFilterChange,
  counts,
  facets,
  facetCounts,
  onReadChange,
  onMonChange,
  onHealthChange,
  onClearFacets,
  actions,
  newGroupSlot,
}: Props): React.JSX.Element {
  // Only one of the two popovers may be open at a time.
  const [openMenu, setOpenMenu] = useState<'filter' | 'sort' | null>(null);

  return (
    <>
      {/* Row 1 — title block + search + view tabs */}
      <div className="app-head">
        <div>
          <div className="app-title">{title}</div>
          {subtitle && <div className="app-sub">{subtitle}</div>}
        </div>
        <div className="row" style={{ gap: 10 }}>
          {/* Search input */}
          <label className="input" style={{ minWidth: 280 }}>
            <Search width={16} height={16} strokeWidth={1.6} />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search the library…"
              aria-label="Search the library"
            />
          </label>

          {/* Grid / List view tabs */}
          <div className="tabs" role="group" aria-label="Library view">
            <button
              type="button"
              className={`tab${view === 'grid' ? ' active' : ''}`}
              onClick={() => onViewChange('grid')}
              aria-pressed={view === 'grid'}
              aria-label="Grid view"
            >
              <LayoutGrid width={13} height={13} strokeWidth={1.6} style={{ marginRight: 6, verticalAlign: -2 }} />
              Grid
            </button>
            <button
              type="button"
              className={`tab${view === 'list' ? ' active' : ''}`}
              onClick={() => onViewChange('list')}
              aria-pressed={view === 'list'}
              aria-label="List view"
            >
              <List width={13} height={13} strokeWidth={1.6} style={{ marginRight: 6, verticalAlign: -2 }} />
              List
            </button>
          </div>

          {actions}
        </div>
      </div>

      {/* Row 2 — ContentTypeFilter (left) + funnel filter & sort (right) */}
      <div className="row" style={{ marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <ContentTypeFilter
          counts={counts}
          selected={typeFilter}
          onSelect={onTypeFilterChange}
        />
        <div className="lib-filters" style={{ marginLeft: 'auto' }}>
          {newGroupSlot}
          <LibraryFilterMenu
            facets={facets}
            counts={facetCounts}
            onSelectRead={onReadChange}
            onSelectMon={onMonChange}
            onSelectHealth={onHealthChange}
            onClear={onClearFacets}
            forceClosed={openMenu === 'sort'}
            onOpen={() => setOpenMenu('filter')}
          />
          <SortMenu
            value={sortKey}
            onChange={onSortChange}
            forceClosed={openMenu === 'filter'}
            onOpen={() => setOpenMenu('sort')}
          />
        </div>
      </div>
    </>
  );
}

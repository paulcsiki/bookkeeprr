'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EmptyState } from '@bookkeeprr/ui';
import { LibraryBig } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useLocalStorage } from '@/components/hooks/useLocalStorage';
import { SeriesList } from '@/components/library/SeriesList';
import { SeriesCard } from '@/components/library/SeriesCard';
import { BookSeriesCard } from '@/components/library/BookSeriesCard';
import { RenameAllButton } from '@/components/library/RenameAllButton';
import { FolderCard, type DropHandlers, type FanCover } from '@/components/library/groups/FolderCard';
import { GroupCrumbs } from '@/components/library/groups/GroupCrumbs';
import { GroupContextMenu, GroupMenuButton } from '@/components/library/groups/GroupActionsMenu';
import { useGroupManagement } from '@/components/library/groups/useGroupManagement';
import {
  childrenOf,
  crumbChain,
  displayPath,
  flatModeActive,
  seriesUnderGroup,
  type GroupNode,
} from '@/components/library/groups/lib';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';
import { libraryCoverSrc } from '@/server/images/allowlist';
import { LibraryControlBar } from './LibraryControlBar';
import { useAddDialog } from '@/components/add/AddDialogProvider';
import { type SortKey, DEFAULT_SORT } from '@/components/library/SortMenu';
import type {
  FacetCounts,
  HealthFacet,
  LibraryFacets,
  MonFacet,
  ReadFacet,
} from '@/components/library/LibraryFilterMenu';
import type { ContentTypeFilterValue } from '@bookkeeprr/ui';
import type { ContentType } from '@bookkeeprr/types';
import type { SeriesRow, BookSeriesRow } from '@/server/db/schema';
import type { AcquisitionCounts } from '@/server/db/series';
import { collapseForView, type Membership } from './collapse';

type ReadState = 'unread' | 'reading' | 'finished';
type HealthState = 'complete' | 'missing' | 'downloading' | 'error';

type Props = {
  series: SeriesRow[];
  /** Library groups (rows + recursive counts + display paths) for browse mode. */
  groups?: GroupNode[];
  /** Per-series owned/total volume counts, keyed by series id. */
  acquisition?: [number, AcquisitionCounts][];
  /** Per-series on-disk size in bytes, keyed by series id. */
  sizes?: [number, number][];
  /** Per-series reading state for the current user, keyed by series id. */
  readStates?: [number, ReadState][];
  /** Per-series download health, keyed by series id. */
  health?: [number, HealthState][];
  initialType?: ContentTypeFilterValue;
  /** When true, route cover URLs through the caching `/api/img` proxy. */
  cacheEnabled?: boolean;
  /** All book series for the collection cards. */
  bookSeriesList?: (BookSeriesRow & { memberCount: number })[];
  /** Junction rows: which series belong to which book series. */
  memberships?: Membership[];
};

function getTitle(s: SeriesRow): string {
  return s.titleEnglish ?? s.titleRomaji ?? s.titleNative ?? `Series #${s.id}`;
}

function readStateOf(map: Map<number, ReadState>, id: number): ReadState {
  return map.get(id) ?? 'unread';
}

function healthOf(map: Map<number, HealthState>, id: number): HealthState {
  // Series with no acquisition data are treated as "missing" (nothing owned).
  return map.get(id) ?? 'missing';
}

function isMonitored(s: SeriesRow): boolean {
  return s.monitoring !== 'none';
}

function matchesRead(state: ReadState, facet: ReadFacet): boolean {
  if (facet === 'all') return true;
  if (facet === 'unfinished') return state !== 'finished';
  return state === facet;
}

function matchesMon(monitored: boolean, facet: MonFacet): boolean {
  if (facet === 'all') return true;
  return facet === 'monitored' ? monitored : !monitored;
}

function matchesHealth(state: HealthState, facet: HealthFacet): boolean {
  if (facet === 'all') return true;
  return state === facet;
}

export function LibraryView({
  series,
  groups = [],
  acquisition,
  sizes,
  readStates,
  health,
  initialType = 'all',
  cacheEnabled = false,
  bookSeriesList = [],
  memberships = [],
}: Props): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const acquisitionMap = useMemo(() => new Map(acquisition ?? []), [acquisition]);
  const sizeMap = useMemo(() => new Map(sizes ?? []), [sizes]);
  const readMap = useMemo(() => new Map(readStates ?? []), [readStates]);
  const healthMap = useMemo(() => new Map(health ?? []), [health]);
  const [view, setView] = useLocalStorage<'grid' | 'list'>('bookkeeprr.library.view', 'grid');
  const [sortKey, setSortKey] = useLocalStorage<SortKey>('bookkeeprr.library.sort', DEFAULT_SORT);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContentTypeFilterValue>(initialType);
  const [readFacet, setReadFacet] = useState<ReadFacet>('all');
  const [monFacet, setMonFacet] = useState<MonFacet>('all');
  const [healthFacet, setHealthFacet] = useState<HealthFacet>('all');
  const { open } = useAddDialog();

  // ---- groups: URL-synced path + optimistic dnd state ----------------------

  // The open group from `?group=<id>` — unknown/invalid ids fall back to root.
  const groupParam = searchParams.get('group');
  const path = useMemo<number | null>(() => {
    if (groupParam === null) return null;
    const id = Number.parseInt(groupParam, 10);
    return Number.isInteger(id) && groups.some((g) => g.id === id) ? id : null;
  }, [groupParam, groups]);

  /** Navigate to a group (null = root) preserving every other search param. */
  function gotoGroup(id: number | null): void {
    const params = new URLSearchParams(searchParams.toString());
    if (id === null) params.delete('group');
    else params.set('group', String(id));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // ---- groups: management state (create / rename / delete) -----------------

  const { groupActions, newGroupSlot, dialogs: groupDialogs } = useGroupManagement({
    path,
    groups,
    gotoGroup,
  });

  // Optimistic move overrides: series id → new group id, applied on top of the
  // server-provided rows until `router.refresh()` brings the moved row back.
  const [moved, setMoved] = useState<ReadonlyMap<number, number | null>>(new Map());
  // Grid-level dnd affordance (dashed folder borders) while a card is dragged.
  const [dnd, setDnd] = useState(false);
  // The hot drop target: a group id, 'root' for the Library crumb, or none.
  const [dropHot, setDropHot] = useState<number | 'root' | null>(null);

  const effectiveSeries = useMemo(() => {
    if (moved.size === 0) return series;
    return series.map((s) =>
      moved.has(s.id) ? { ...s, groupId: moved.get(s.id) ?? null } : s,
    );
  }, [series, moved]);

  async function moveSeries(seriesId: number, target: number | null): Promise<void> {
    const row = effectiveSeries.find((s) => s.id === seriesId);
    if (!row || (row.groupId ?? null) === target) return;
    // Optimistic: override locally, confirm with the server, refresh either way.
    setMoved((prev) => new Map(prev).set(seriesId, target));
    try {
      const r = await apiFetch(`/api/series/${seriesId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupId: target }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
      setMoved((prev) => {
        const next = new Map(prev);
        next.delete(seriesId);
        return next;
      });
    } catch (e) {
      setMoved((prev) => {
        const next = new Map(prev);
        next.delete(seriesId);
        return next;
      });
      toast.error(e instanceof Error ? e.message : 'Failed to move series');
      router.refresh();
    }
  }

  /** One factory for folder cards AND crumbs (`null` target = Library root). */
  function dropHandlersFor(target: number | null): DropHandlers {
    const key: number | 'root' = target ?? 'root';
    return {
      onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropHot(key);
      },
      onDragLeave: (e) => {
        // Ignore leave events caused by entering a child of the same target.
        if (
          e.relatedTarget instanceof Node &&
          e.currentTarget instanceof Node &&
          e.currentTarget.contains(e.relatedTarget)
        ) {
          return;
        }
        setDropHot((h) => (h === key ? null : h));
      },
      onDrop: (e) => {
        e.preventDefault();
        setDropHot(null);
        setDnd(false);
        const id = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isInteger(id) && id > 0) void moveSeries(id, target);
      },
    };
  }

  function onCardDragStart(e: React.DragEvent, id: number): void {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
    // Imperative class (design idiom) — re-rendering the dragged element
    // inside dragstart can cancel the native drag in Chromium, so the React
    // state flip for the grid affordance is deferred a tick.
    if (e.currentTarget instanceof Element) e.currentTarget.classList.add('dragging');
    window.setTimeout(() => setDnd(true), 0);
  }

  function onGridDragEnd(e: React.DragEvent): void {
    setDnd(false);
    setDropHot(null);
    if (e.target instanceof Element) e.target.closest('.lib-card')?.classList.remove('dragging');
  }

  // Per-type counts from the full series list (not filtered).
  const counts = useMemo(() => {
    const c: Record<ContentType, number> = {
      manga: 0,
      comic: 0,
      light_novel: 0,
      ebook: 0,
      audiobook: 0,
    };
    for (const s of series) {
      if (s.contentType in c) c[s.contentType as ContentType]++;
    }
    return c;
  }, [series]);

  // Per-facet-option counts, computed over the full series list (independent of
  // the active facets — they show "how many would match if you picked this").
  const facetCounts = useMemo<FacetCounts>(() => {
    const total = series.length;
    const read: Record<ReadFacet, number> = {
      all: total,
      unfinished: 0,
      unread: 0,
      reading: 0,
      finished: 0,
    };
    const mon: Record<MonFacet, number> = { all: total, monitored: 0, unmonitored: 0 };
    const healthCounts: Record<HealthFacet, number> = {
      all: total,
      complete: 0,
      missing: 0,
      downloading: 0,
      error: 0,
    };
    for (const s of series) {
      const rs = readStateOf(readMap, s.id);
      read[rs]++;
      if (rs !== 'finished') read.unfinished++;
      if (isMonitored(s)) mon.monitored++;
      else mon.unmonitored++;
      healthCounts[healthOf(healthMap, s.id)]++;
    }
    return { read, mon, health: healthCounts };
  }, [series, readMap, healthMap]);

  const facets: LibraryFacets = { read: readFacet, mon: monFacet, health: healthFacet };

  function clearFacets(): void {
    setReadFacet('all');
    setMonFacet('all');
    setHealthFacet('all');
  }

  // Filter + sort pipeline — WITHOUT text search (search is delegated to
  // collapseForView so that book-series name matching works correctly even when
  // no member title contains the query string).
  const filtered = useMemo(() => {
    let xs = effectiveSeries;

    // Type filter
    if (typeFilter !== 'all') {
      xs = xs.filter((s) => s.contentType === typeFilter);
    }

    // Reading / monitoring / health facets
    if (readFacet !== 'all' || monFacet !== 'all' || healthFacet !== 'all') {
      xs = xs.filter(
        (s) =>
          matchesRead(readStateOf(readMap, s.id), readFacet) &&
          matchesMon(isMonitored(s), monFacet) &&
          matchesHealth(healthOf(healthMap, s.id), healthFacet),
      );
    }

    // Sort
    switch (sortKey) {
      case 'title_az':
        xs = [...xs].sort((a, b) => getTitle(a).localeCompare(getTitle(b)));
        break;
      case 'title_za':
        xs = [...xs].sort((a, b) => getTitle(b).localeCompare(getTitle(a)));
        break;
      case 'media_type':
        xs = [...xs].sort(
          (a, b) => a.contentType.localeCompare(b.contentType) || getTitle(a).localeCompare(getTitle(b)),
        );
        break;
      case 'oldest':
        xs = [...xs].sort((a, b) => (a.addedAt?.getTime() ?? 0) - (b.addedAt?.getTime() ?? 0));
        break;
      case 'recently_added':
      default:
        xs = [...xs].sort((a, b) => (b.addedAt?.getTime() ?? 0) - (a.addedAt?.getTime() ?? 0));
        break;
    }

    return xs;
  }, [effectiveSeries, typeFilter, sortKey, readFacet, monFacet, healthFacet, readMap, healthMap]);

  // Text-searched version of filtered — used only for the list-view (which
  // renders SeriesRow items directly without collapse) and for the subtitle
  // "N of M shown" counter. collapseForView handles text search internally
  // for the grid (both flat and browse modes).
  const filteredWithSearch = useMemo(() => {
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter((s) => getTitle(s).toLowerCase().includes(q));
  }, [filtered, search]);

  // Any non-default facet or search switches to a flat, group-agnostic view
  // (folders + crumbs hidden, matches shown with a group tag).
  const flat = flatModeActive({
    type: typeFilter,
    read: readFacet,
    health: healthFacet,
    mon: monFacet,
    q: search.trim(),
  });

  // Browse-mode pieces (grid view only — list view always renders flat).
  const folders = childrenOf(groups, path);
  // In browse mode no filters are active, so `filtered` is the full library
  // under the current sort — narrow it to the open group's direct members.
  const browseSeries = useMemo(
    () => filtered.filter((s) => (s.groupId ?? null) === path),
    [filtered, path],
  );

  // Collapsed cards for browse mode and flat mode: book-series cards collapse
  // their member titles; standalone titles stay as series cards.
  const browseCards = useMemo(
    () => collapseForView(browseSeries, memberships, bookSeriesList, { search: '', typeFilter: 'all' }).cards,
    [browseSeries, memberships, bookSeriesList],
  );

  // flatCards: `filtered` already has typeFilter applied (at the series level);
  // pass typeFilter:'all' to collapseForView to avoid double-filtering book-series
  // cards. collapseForView handles text search here (C1 fix).
  const flatCards = useMemo(
    () => collapseForView(filtered, memberships, bookSeriesList, { search: search.trim(), typeFilter: 'all' }).cards,
    [filtered, memberships, bookSeriesList, search],
  );

  /** Up to 3 recursive member covers per folder, keyed by group id. */
  const fanCoversByGroup = useMemo(
    () =>
      new Map<number, FanCover[]>(
        folders.map((g) => [
          g.id,
          seriesUnderGroup(effectiveSeries, groups, g.id)
            .slice(0, 3)
            .map((s) => ({ coverUrl: libraryCoverSrc(s.coverUrl, cacheEnabled) ?? null, seed: s.id })),
        ]),
      ),
    [folders, effectiveSeries, groups, cacheEnabled],
  );

  /** Count of all series recursively under the currently-open group (for subtitle). */
  const seriesUnderPathCount = useMemo(
    () => (path !== null ? seriesUnderGroup(effectiveSeries, groups, path).length : 0),
    [effectiveSeries, groups, path],
  );

  // Subtitle string for control bar (root / in-group / flat variants).
  // In flat mode the shown-count is the number of visible CARDS (not raw series
  // rows), so book-series members that collapsed into one card don't inflate it.
  const subtitle = flat
    ? `${flatCards.length} of ${series.length} shown · filtered`
    : view === 'grid' && path !== null
      ? `${displayPath(groups, path)} · ${folders.length} folders · ${seriesUnderPathCount} series`
      : groups.length > 0
        ? `${series.length} series — ${series.filter(isMonitored).length} monitored · ${groups.length} groups`
        : `${series.length} series`;

  const controlBar = (
    <>
      <LibraryControlBar
        title="Library"
        subtitle={subtitle}
        search={search}
        onSearchChange={setSearch}
        view={view}
        onViewChange={setView}
        sortKey={sortKey}
        onSortChange={setSortKey}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        counts={counts}
        facets={facets}
        facetCounts={facetCounts}
        onReadChange={setReadFacet}
        onMonChange={setMonFacet}
        onHealthChange={setHealthFacet}
        onClearFacets={clearFacets}
        actions={<RenameAllButton />}
        newGroupSlot={newGroupSlot}
      />
      {groupDialogs}
    </>
  );

  if (series.length === 0 && groups.length === 0) {
    return (
      <div>
        {controlBar}
        <EmptyState
          icon={<LibraryBig />}
          title="Your library is empty"
          body="Add your first series and bookkeeprr will start monitoring releases across every indexer you've connected."
          actions={
            <>
              <Button onClick={() => open()}>Add series</Button>
              <Button variant="outline" asChild>
                <Link href="/settings/library/scan">Import a folder</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (view === 'list') {
    // List view stays group-agnostic: always the flat library (no folders, no
    // group narrowing) — the grid is the grouped surface, per the design.
    // Uses filteredWithSearch so text search applies to individual series rows
    // (list view renders rows directly, not collapsed book-series cards).
    return (
      <div>
        {controlBar}
        {filteredWithSearch.length === 0 ? (
          <FilteredEmpty />
        ) : (
          <SeriesList
            series={filteredWithSearch}
            acquisition={acquisitionMap}
            sizes={sizeMap}
            cacheEnabled={cacheEnabled}
          />
        )}
      </div>
    );
  }

  if (flat) {
    return (
      <div>
        {controlBar}
        <div className="library-grid">
          {flatCards.length === 0 ? (
            <FilteredEmpty />
          ) : (
            flatCards.map((card) =>
              card.kind === 'bookSeries' ? (
                <BookSeriesCard
                  key={`bs-${card.bookSeries.id}`}
                  bookSeries={card.bookSeries}
                  matchedTitle={card.matchedTitle}
                  cacheEnabled={cacheEnabled}
                />
              ) : (
                <SeriesCard
                  key={card.series.id}
                  series={card.series}
                  acquisition={acquisitionMap.get(card.series.id)}
                  cacheEnabled={cacheEnabled}
                  groupTag={displayPath(groups, card.series.groupId ?? null) || undefined}
                />
              ),
            )
          )}
        </div>
      </div>
    );
  }

  // Browse mode — folders first (alphabetical), then the open group's series.
  return (
    <div>
      {controlBar}
      {path !== null && (
        <GroupCrumbs
          chain={crumbChain(groups, path)}
          onNavigate={gotoGroup}
          dropHotId={dropHot}
          dropHandlersFor={dropHandlersFor}
        />
      )}
      <div className={cn('library-grid', dnd && 'dnd')} onDragEnd={onGridDragEnd}>
        {folders.map((g) => (
          <GroupContextMenu key={`group-${g.id}`} group={g} {...groupActions}>
            <FolderCard
              group={g}
              fanCovers={fanCoversByGroup.get(g.id) ?? []}
              onOpen={gotoGroup}
              dropState={dropHot === g.id ? 'hot' : 'idle'}
              dropHandlers={dropHandlersFor(g.id)}
              menuSlot={<GroupMenuButton group={g} {...groupActions} />}
              testId={`folder-card-${g.id}`}
            />
          </GroupContextMenu>
        ))}
        {browseCards.map((card) =>
          card.kind === 'bookSeries' ? (
            <BookSeriesCard
              key={`bs-${card.bookSeries.id}`}
              bookSeries={card.bookSeries}
              matchedTitle={card.matchedTitle}
              cacheEnabled={cacheEnabled}
            />
          ) : (
            <SeriesCard
              key={card.series.id}
              series={card.series}
              acquisition={acquisitionMap.get(card.series.id)}
              cacheEnabled={cacheEnabled}
              draggable
              onDragStart={(e) => onCardDragStart(e, card.series.id)}
            />
          ),
        )}
        {folders.length === 0 && browseCards.length === 0 && <EmptyGroup />}
      </div>
    </div>
  );
}

/** Filtered-empty state spanning the grid (dashed border). */
function FilteredEmpty(): React.JSX.Element {
  return (
    <div className="lib-empty">
      <div className="ttl">No series match</div>
      <div className="sub">Try clearing a filter to see more of your library.</div>
    </div>
  );
}

/** Empty-group state — shown when an open group has no folders and no series. */
function EmptyGroup(): React.JSX.Element {
  return (
    <div className="lib-empty">
      <div className="ttl">This group is empty</div>
      <div className="sub">
        Drag series onto the folder card to move them in — or onto a breadcrumb to move them back
        out.
      </div>
    </div>
  );
}

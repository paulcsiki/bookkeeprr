'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Check, Compass, Globe, Plus, Search, SearchX } from 'lucide-react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { EmptyState } from '@bookkeeprr/ui';
import { openLibraryCoverUrl } from '@bookkeeprr/ui';
import { Button } from '@/components/ui/button';
import { useLocalStorage } from '@/components/hooks/useLocalStorage';
import { ContentTypeFilter, type ContentTypeFilterValue } from '@bookkeeprr/ui';
import {
  DLABEL,
  DSOURCES,
  TOKEN_FOR_TYPE,
  computeCounts,
  type BrowseItem,
  type DType,
} from './fixtures';
import { RiffleLoader } from './RiffleLoader';
import { Cover } from '@/components/Cover';
import { DiscoverDetailDialog } from './DiscoverDetailDialog';
import type { DiscoverResult } from '@/app/api/discover/search/route';
import type { DiscoverSource } from '@/app/api/discover/sources/route';
import type { BrowseRow } from '@/server/discover/browse';

type Mode = 'browse' | 'searching' | 'results' | 'category';

// The API response for one page of a category (the "See all" infinite scroll).
type CategoryPage = {
  items: BrowseRow['items'];
  hasMore: boolean;
};
type Filter = 'all' | DType;

// Display shape for a tile: the lossy BrowseItem projection plus the original
// DiscoverResult, which the detail modal / add flow needs in full.
type TileItem = BrowseItem & {
  isbn?: string | null;
  coverUrl?: string | null;
  detail?: string | null;
  result: DiscoverResult;
};

const HUE_FOR_TYPE: Record<DType, number> = {
  manga: 12,
  light_novel: 220,
  comic: 45,
  ebook: 160,
  audiobook: 290,
};

// Maps DiscoverResult (API shape) to a tile display item, carrying the result.
function resultToTileItem(r: DiscoverResult): TileItem {
  const dtype = r.contentType as DType;
  return {
    t: r.title,
    k: dtype,
    author: r.author ?? '',
    hue: HUE_FOR_TYPE[dtype] ?? 12,
    isbn: r.isbn,
    coverUrl: r.coverUrl,
    detail: r.detail,
    inLib: r.inLib,
    result: r,
  };
}

// Maps an API BrowseRow item (a DiscoverResult-compatible shape) to a tile item.
function browseItemFromApi(item: BrowseRow['items'][number]): TileItem {
  return resultToTileItem({
    contentType: item.contentType,
    sourceId: item.sourceId,
    title: item.title,
    year: item.year ?? null,
    author: item.author ?? null,
    isbn: item.isbn ?? null,
    coverUrl: item.coverUrl ?? null,
    source: item.source,
    detail: item.detail,
    inLib: item.inLib,
    malId: item.malId ?? null,
    sources: item.sources,
  });
}

// Cover tile — content-type-tinted fallback + overlays (type pill, add/check).
function DiscoverTile({
  d,
  onOpen,
}: {
  d: TileItem;
  onOpen: (r: DiscoverResult) => void;
}): React.JSX.Element {
  const inLib = d.inLib === true;

  // Prefer API coverUrl, fall back to OpenLibrary ISBN URL, then the tinted card.
  const coverSrc = d.coverUrl ?? (d.isbn ? openLibraryCoverUrl(d.isbn) : null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(d.result)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(d.result);
        }
      }}
      className="group flex cursor-pointer flex-col gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Fixed-aspect wrapper: the size lives here, not on <Cover>, because
          Cover's `.cv { width/height:100% }` base rule would otherwise defeat a
          Tailwind aspect utility passed to it (cards rendered uneven). */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border transition-transform duration-200 group-hover:scale-[1.02]">
        <Cover
          className="absolute inset-0"
          src={coverSrc}
          contentType={d.k}
          title={d.t}
          alt=""
          hideType
        >
        {/* type pill */}
        <span
          className="absolute left-2 top-2 z-10 font-mono text-[9px] uppercase tracking-[0.1em]"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 18,
            padding: '0 6px',
            borderRadius: 999,
            color: `var(--color-${TOKEN_FOR_TYPE[d.k]})`,
            // Solid card background (matches <ContentTypePill>) — never a
            // translucent tint, which reads faint over cover art.
            background: 'var(--color-card)',
            border: `1px solid oklch(from var(--color-${TOKEN_FOR_TYPE[d.k]}) l c h / 0.5)`,
          }}
        >
          {DLABEL[d.k]}
        </span>
        {inLib ? (
          <span className="absolute right-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-full border border-border bg-card">
            <Check className="h-3 w-3 text-ok" strokeWidth={2.4} />
          </span>
        ) : (
          <span
            className="absolute bottom-2 right-2 z-10 grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100"
            style={{
              boxShadow: '0 6px 16px -4px color-mix(in oklab, var(--color-primary) 60%, transparent)',
            }}
            aria-label="Add to library"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
          </span>
        )}
        </Cover>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-foreground">{d.t}</div>
        <div className="mt-0.5 truncate font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
          {d.author}
        </div>
        {d.detail ? (
          <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground/70">
            {d.detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// The CSS variable for discover grid columns.
// Default: 6 columns; tablet (768-1023px) overrides to 5 via discover.css.
const GRID_STYLE = {
  display: 'grid' as const,
  gap: '20px',
  gridTemplateColumns: 'repeat(var(--discover-cols, 6), minmax(0, 1fr))',
};

export function DiscoverClient(_props?: { cols?: number }): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('browse');
  // The content-type filter. Defaults to manga on first visit and persists the
  // last choice; it drives both the browse rails and the search content-type.
  const [activeType, setActiveType] = useLocalStorage<Filter>('bookkeeprr.discover.type', 'manga');
  const [query, setQuery] = useState('');
  // The query that was last submitted (drives the search API call).
  const [submittedQuery, setSubmittedQuery] = useState('');
  // The submitted content-type filter at time of search.
  // Transient filter applied to search results in results mode. Kept separate
  // from the persisted `activeType` so re-filtering results never overwrites the
  // user's persisted browse type.
  const [resultFilter, setResultFilter] = useState<Filter>('all');
  // Real search results from the API.
  const [searchResults, setSearchResults] = useState<TileItem[]>([]);
  const [searchMeta, setSearchMeta] = useState<{ query: string; tookMs: number } | null>(null);
  // The result whose detail modal is open (null = closed).
  const [detailResult, setDetailResult] = useState<DiscoverResult | null>(null);
  // The category being browsed in 'category' mode (the "See all" infinite view).
  const [category, setCategory] = useState<{
    rowId: string;
    label: string;
    meta: string;
    contentType: DType;
  } | null>(null);

  // -------------------------------------------------------------------------
  // Sources: /api/discover/sources
  // -------------------------------------------------------------------------
  const sourcesQuery = useQuery<{ sources: DiscoverSource[] }>({
    queryKey: ['discover-sources'],
    queryFn: async () => {
      const r = await fetch('/api/discover/sources');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ sources: DiscoverSource[] }>;
    },
    staleTime: 5 * 60_000,
  });
  const configuredCount = sourcesQuery.data?.sources.filter((s) => s.configured).length
    ?? DSOURCES.length;

  // -------------------------------------------------------------------------
  // Browse: /api/discover/browse?contentType=<type> (live data; loader shown
  // while fetching). The "All" filter has no cross-type browse source yet, so it
  // falls back to the manga rails.
  // -------------------------------------------------------------------------
  const browseType: DType = activeType === 'all' ? 'manga' : activeType;
  const browseQuery = useQuery<{ rows: BrowseRow[] }>({
    queryKey: ['discover-browse', browseType],
    queryFn: async () => {
      const r = await fetch(`/api/discover/browse?contentType=${browseType}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ rows: BrowseRow[] }>;
    },
    staleTime: 5 * 60_000,
  });

  // No fixture placeholder — show the loader while fetching so fake cards never
  // flash before the real results.
  const activeBrowseRows = browseQuery.data?.rows ?? [];

  // -------------------------------------------------------------------------
  // Search: /api/discover/search
  // -------------------------------------------------------------------------
  const searchQuery = useQuery<{
    results: DiscoverResult[];
    tookMs: number;
    errors?: Record<string, string>;
  }>({
    // Always search every type (no server narrowing) so the result-filter chips
    // keep their real counts and stay clickable — narrowing by type would zero
    // out the other chips and trap the selection until "All" is re-picked.
    queryKey: ['discover-search', submittedQuery],
    enabled: submittedQuery.trim().length > 0 && mode === 'searching',
    queryFn: async () => {
      const qs = new URLSearchParams({ q: submittedQuery });
      const r = await fetch(`/api/discover/search?${qs.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{
        results: DiscoverResult[];
        tookMs: number;
        errors?: Record<string, string>;
      }>;
    },
    staleTime: 30_000,
  });

  // -------------------------------------------------------------------------
  // Category: /api/discover/category (infinite scroll for a single browse row,
  // i.e. the "See all" view). Pages 1-based; getNextPageParam advances until the
  // backend reports hasMore=false.
  // -------------------------------------------------------------------------
  const categoryQuery = useInfiniteQuery<CategoryPage>({
    queryKey: ['discover-category', category?.contentType, category?.rowId],
    enabled: mode === 'category' && category != null,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      if (!category) return { items: [], hasMore: false };
      const r = await fetch(
        `/api/discover/category?contentType=${category.contentType}&row=${category.rowId}&page=${pageParam as number}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<CategoryPage>;
    },
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    staleTime: 5 * 60_000,
  });

  const categoryItems = useMemo<TileItem[]>(
    () =>
      (categoryQuery.data?.pages ?? []).flatMap((p) => p.items.map(browseItemFromApi)),
    [categoryQuery.data],
  );

  // IntersectionObserver sentinel: fetch the next page when it scrolls into view.
  // The scroll happens in the inner `scrollRef` container (not the window), so
  // the observer roots on it; a generous rootMargin prefetches before the user
  // hits the very bottom.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = categoryQuery;
  useEffect(() => {
    if (mode !== 'category') return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root: scrollRef.current, rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, hasNextPage, isFetchingNextPage, fetchNextPage, categoryItems.length]);

  const openCategory = useCallback((row: BrowseRow, contentType: DType) => {
    setCategory({ rowId: row.id, label: row.label, meta: row.meta, contentType });
    setMode('category');
  }, []);

  // Transition: searching → results when query resolves.
  useEffect(() => {
    if (mode !== 'searching') return;
    if (searchQuery.isSuccess && searchQuery.data) {
      const items = searchQuery.data.results.map(resultToTileItem);
      setSearchResults(items);
      setSearchMeta({ query: submittedQuery, tookMs: searchQuery.data.tookMs });
      setMode('results');
    }
  }, [mode, searchQuery.isSuccess, searchQuery.data, submittedQuery]);

  // Transition: searching → results (error path — show empty)
  useEffect(() => {
    if (mode !== 'searching') return;
    if (searchQuery.isError) {
      setSearchResults([]);
      setSearchMeta({ query: submittedQuery, tookMs: 0 });
      setMode('results');
    }
  }, [mode, searchQuery.isError, submittedQuery]);

  const runSearch = useCallback(
    () => {
      const q = query.trim();
      if (!q) return;
      setSubmittedQuery(q);
      // Start results unfiltered. Every type is fetched (no server narrowing),
      // so all result-filter chips keep real counts and you can switch freely.
      setResultFilter('all');
      setMode('searching');
    },
    [query],
  );

  // Counts for the content-type filter chips.
  const browsePool = useMemo(
    () => activeBrowseRows.flatMap((r) => r.items.map(browseItemFromApi)),
    [activeBrowseRows],
  );
  const browseCounts = useMemo(() => computeCounts(browsePool), [browsePool]);

  const counts = useMemo(() => computeCounts(searchResults), [searchResults]);
  const shown =
    resultFilter === 'all' ? searchResults : searchResults.filter((r) => r.k === resultFilter);

  // Browse has rows only for manga / light_novel / ebook; comic / audiobook
  // (and any all-filter pointing at an empty source) yield no curated rows.
  const browseEmpty = activeBrowseRows.every((row) => row.items.length === 0);

  return (
    <div className="discover-client -m-6 flex h-[calc(100%+3rem)] flex-col">
      {/* sticky header */}
      <div className="border-b border-border bg-background px-6 pb-4 pt-6">
        <div className="mb-4 flex items-end gap-6">
          <div>
            <h1 className="app-title">Discover</h1>
            <div className="app-sub">Add to library</div>
          </div>
          <div className="ml-auto flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            <Globe className="h-3.5 w-3.5" /> {configuredCount} sources connected
          </div>
        </div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 flex-1 items-center gap-3 rounded-xl border border-border bg-card px-4 transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
            <Search className="h-4 w-4 text-muted-foreground [div:focus-within>&]:text-primary" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch();
              }}
              placeholder={`Search ${DSOURCES.join(', ')}…`}
              className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <span className="flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              <span>⌘</span>
              <span>K</span>
            </span>
          </div>
          {/* No visible Search button — submit on ⏎ */}
          {mode !== 'browse' ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setMode('browse');
                setResultFilter('all');
                setCategory(null);
              }}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
        {mode === 'browse' || mode === 'results' ? (
          mode === 'browse' ? (
            <ContentTypeFilter
              selectorOnly
              counts={browseCounts}
              selected={activeType as ContentTypeFilterValue}
              onSelect={(v) => setActiveType(v as Filter)}
            />
          ) : (
            <ContentTypeFilter
              counts={counts}
              selected={resultFilter as ContentTypeFilterValue}
              onSelect={(v) => setResultFilter(v as Filter)}
            />
          )
        ) : null}
      </div>

      {/* body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-10 pt-6">
        {mode === 'browse' && browseQuery.isPending ? (
          <div key="browse-loading" className="disc-fade-up grid min-h-[420px] place-items-center">
            <div className="flex flex-col items-center gap-7">
              <RiffleLoader unit={96} />
              <div className="font-mono text-[11.5px] tracking-wide text-muted-foreground">
                loading {DLABEL[browseType].toLowerCase()} discovery
              </div>
            </div>
          </div>
        ) : null}

        {mode === 'browse' && !browseQuery.isPending ? (
          <div key={`browse-${browseType}`} className="disc-fade-up">
            {browseEmpty ? (
              <EmptyState
                variant="muted"
                icon={<Compass />}
                title={`No curated ${DLABEL[browseType].toLowerCase()} discovery yet`}
                body="Search above to find titles from the connected sources."
              />
            ) : (
              activeBrowseRows.map((row) => (
                <div key={row.id} className="mb-7">
                  <div className="mb-3.5 flex items-baseline">
                    <span className="font-display text-[17px] font-semibold tracking-tight text-foreground">
                      {row.label}
                    </span>
                    <span className="ml-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                      {row.meta}
                    </span>
                    <button
                      type="button"
                      onClick={() => openCategory(row, browseType)}
                      className="ml-auto text-[12.5px] font-medium text-primary hover:underline"
                    >
                      See all →
                    </button>
                  </div>
                  <div className="discover-grid" style={GRID_STYLE}>
                    {row.items.map((item, i) => (
                      <DiscoverTile key={i} d={browseItemFromApi(item)} onOpen={setDetailResult} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {mode === 'searching' ? (
          <div key="searching" className="disc-fade-up grid min-h-[420px] place-items-center">
            <div className="flex flex-col items-center gap-7">
              <RiffleLoader unit={96} />
              <div className="font-mono text-[11.5px] tracking-wide text-muted-foreground">
                &quot;{submittedQuery}&quot; · scanning {configuredCount} sources
              </div>
            </div>
          </div>
        ) : null}

        {mode === 'results' ? (
          <div key="results" className="disc-pop">
            <div className="mb-4 flex items-baseline">
              <span className="font-display text-[17px] font-semibold tracking-tight text-foreground">
                {shown.length}{' '}
                {resultFilter === 'all' ? 'results' : `${DLABEL[resultFilter as DType]} results`}
              </span>
              <span className="ml-3 text-[14px] text-muted-foreground">
                for &quot;{searchMeta?.query ?? submittedQuery}&quot;
              </span>
              {searchMeta ? (
                <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                  {searchMeta.tookMs}ms
                </span>
              ) : null}
            </div>
            {shown.length === 0 ? (
              <EmptyState
                variant="muted"
                icon={<SearchX />}
                title={`No matches for "${searchMeta?.query ?? submittedQuery}"`}
                body="Try clearing filters or widening the type."
                actions={
                  <Button variant="outline" onClick={() => setResultFilter('all')}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <div className="discover-grid" style={GRID_STYLE}>
                {shown.map((d, i) => (
                  <DiscoverTile key={i} d={d} onOpen={setDetailResult} />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {mode === 'category' && category ? (
          <div key={`category-${category.contentType}-${category.rowId}`} className="disc-fade-up">
            <div className="mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('browse');
                  setCategory(null);
                }}
                className="mb-2 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Discover
              </button>
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-[22px] font-semibold tracking-tight text-foreground">
                  {category.label}
                </h2>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  {category.meta}
                </span>
              </div>
            </div>

            {categoryQuery.isPending ? (
              <div className="grid min-h-[420px] place-items-center">
                <div className="flex flex-col items-center gap-7">
                  <RiffleLoader unit={96} />
                  <div className="font-mono text-[11.5px] tracking-wide text-muted-foreground">
                    loading {category.label.toLowerCase()}
                  </div>
                </div>
              </div>
            ) : categoryItems.length === 0 ? (
              <EmptyState
                variant="muted"
                icon={<Compass />}
                title={`Nothing in ${category.label.toLowerCase()} right now`}
                body="Search above to find titles from the connected sources."
              />
            ) : (
              <>
                <div className="discover-grid" style={GRID_STYLE}>
                  {categoryItems.map((d, i) => (
                    <DiscoverTile key={i} d={d} onOpen={setDetailResult} />
                  ))}
                </div>
                {/* Infinite-scroll sentinel: intersecting triggers fetchNextPage. */}
                <div ref={sentinelRef} aria-hidden className="h-px w-full" />
                {isFetchingNextPage ? (
                  <div className="mt-6 flex justify-center">
                    <RiffleLoader unit={56} />
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <DiscoverDetailDialog
        result={detailResult}
        open={detailResult != null}
        onOpenChange={(o) => {
          if (!o) setDetailResult(null);
        }}
      />
    </div>
  );
}

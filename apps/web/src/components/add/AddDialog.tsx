'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ContentTypeFilter, ContentTypePill, type ContentTypeFilterValue } from '@bookkeeprr/ui';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Cover } from '@/components/Cover';
import { apiFetch } from '@/lib/api-fetch';
import type { ContentType } from '@/server/content-type';
import type { DiscoverResult } from '@/app/api/discover/search/route';
import type { OpenAddDialogOptions } from './AddDialogProvider';
import { ConfigureSheet } from './ConfigureSheet';
import { useAddInfra, resultKey } from './useAddInfra';
import { RiffleLoader } from '@/app/(app)/discover/RiffleLoader';
import { GroupPicker } from '@/components/library/groups/GroupPicker';
import { useLibraryGroups } from '@/components/library/groups/useLibraryGroups';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional prefill applied when the dialog transitions from closed → open. */
  initialOpts?: OpenAddDialogOptions;
};

type SearchResponse = {
  results: DiscoverResult[];
  tookMs: number;
  errors?: Record<string, string>;
};

const ZERO_COUNTS: Record<ContentType, number> = {
  manga: 0,
  light_novel: 0,
  comic: 0,
  ebook: 0,
  audiobook: 0,
};

// Builds the `source: …` label from the providers present in the shown rows.
function sourceLabel(results: DiscoverResult[]): string {
  const labels = new Set<string>();
  for (const r of results) {
    if (r.sources?.anilist != null) labels.add('anilist');
    if (r.sources?.mal != null) labels.add('mal');
    if (r.sources?.mangadex != null) labels.add('mdex');
    if (r.sources?.comicvine != null) labels.add('comicvine');
    if (r.sources?.openlibrary != null) labels.add('openlibrary');
    if (r.sources?.audnex != null) labels.add('audnex');
    if (r.sources?.novelupdates != null) labels.add('novelupdates');
    if (labels.size === 0 && r.source) labels.add(r.source);
  }
  return [...labels].join(' + ');
}

// Compact mono id line from cross-linked provider ids, truncating long values.
function sourceIds(r: DiscoverResult): string {
  const trunc = (v: string): string => (v.length > 8 ? `${v.slice(0, 4)}…` : v);
  const parts: string[] = [];
  if (r.sources?.anilist != null) parts.push(`anilist:${r.sources.anilist}`);
  if (r.sources?.mal != null) parts.push(`mal:${r.sources.mal}`);
  if (r.sources?.mangadex != null) parts.push(`mdex:${trunc(r.sources.mangadex)}`);
  if (r.sources?.comicvine != null) parts.push(`comicvine:${r.sources.comicvine}`);
  if (r.sources?.openlibrary != null) parts.push(`olid:${trunc(r.sources.openlibrary)}`);
  if (r.sources?.audnex != null) parts.push(`asin:${trunc(r.sources.audnex)}`);
  if (r.sources?.novelupdates != null) parts.push(`nu:${trunc(r.sources.novelupdates)}`);
  return parts.join(' · ');
}

function metaLine(r: DiscoverResult): string {
  const parts: string[] = [];
  if (r.author) parts.push(r.author);
  if (r.year != null) parts.push(String(r.year));
  if (r.detail) parts.push(r.detail);
  return parts.join(' · ');
}

export function AddDialog({ open, onOpenChange, initialOpts }: Props): React.JSX.Element {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeType, setActiveType] = useState<ContentTypeFilterValue>('all');
  const [highlight, setHighlight] = useState(0);
  // True while a per-row split-button menu is open — lets us swallow Escape so it
  // closes the menu (not the whole dialog).
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  // "Add into" library group — null means Library root. Applies to both the
  // quick-add path and the Add & configure sheet; resets when the dialog closes.
  const [groupId, setGroupId] = useState<number | null>(null);

  // Shared add infrastructure (quick-add, configure sheet, in-library tracking).
  const { addingKey, sheetTarget, setSheetTarget, isInLib, openConfigure, quickAdd } =
    useAddInfra();

  const { groups, loading: groupsLoading, refresh: refreshGroups } = useLibraryGroups();

  // Reset transient state whenever the dialog closes; seed from initialOpts on open.
  useEffect(() => {
    if (open) {
      // Seed search input and type filter from caller-supplied prefill (may be
      // undefined for no-args callers like SearchTrigger and LibraryView — those
      // get the normal empty state).
      const prefillQuery = initialOpts?.query ?? '';
      const prefillType: ContentTypeFilterValue = initialOpts?.contentType ?? 'all';
      setQuery(prefillQuery);
      // Skip the 300ms debounce for the initial prefill so results appear immediately.
      setDebouncedQuery(prefillQuery.trim());
      setActiveType(prefillType);
      setHighlight(0);
      setSplitMenuOpen(false);
      setGroupId(null);
    } else {
      setQuery('');
      setDebouncedQuery('');
      setActiveType('all');
      setHighlight(0);
      setSheetTarget(null);
      setSplitMenuOpen(false);
      setGroupId(null);
    }
  }, [open]); // intentionally omit initialOpts — we only seed when open transitions

  // Re-fetch the group list each time the dialog opens so a group created in
  // another tab/surface shows up without a full reload.
  useEffect(() => {
    if (open) refreshGroups();
  }, [open, refreshGroups]);

  // Debounce the query (~300ms).
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const enabled = open && debouncedQuery.length >= 3;

  // Always fetch the full (all-types) result set — the query does NOT depend on
  // the active type filter. This keeps every chip's count accurate and clickable
  // so you can switch directly between filters; narrowing server-side would zero
  // out the other chips (zero-count chips are disabled), trapping the selection.
  const searchQuery = useQuery<SearchResponse>({
    queryKey: ['add-dialog-search', debouncedQuery],
    enabled,
    queryFn: async () => {
      const qs = new URLSearchParams({ q: debouncedQuery });
      const r = await apiFetch(`/api/discover/search?${qs.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as SearchResponse;
    },
    staleTime: 30_000,
  });

  const results = useMemo(() => searchQuery.data?.results ?? [], [searchQuery.data]);
  const counts = useMemo(() => {
    const c: Record<ContentType, number> = { ...ZERO_COUNTS };
    for (const r of results) c[r.contentType] = (c[r.contentType] ?? 0) + 1;
    return c;
  }, [results]);

  // Filter the displayed rows by the active chip client-side (the request always
  // returns every type), so changing filters is instant and never disables the
  // other chips.
  const shown = useMemo(
    () => (activeType === 'all' ? results : results.filter((r) => r.contentType === activeType)),
    [results, activeType],
  );

  // Keep highlight in range as results change.
  useEffect(() => {
    setHighlight((h) => (shown.length === 0 ? 0 : Math.min(h, shown.length - 1)));
  }, [shown.length]);

  const showEmpty = debouncedQuery.length < 3;
  const srcLabel = sourceLabel(shown);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            // Focus the search input rather than the first tabbable element.
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onEscapeKeyDown={(e) => {
            // A split-button menu is open — Escape should close just the menu.
            if (splitMenuOpen) e.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">Add to library</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search AniList, MangaDex, ComicVine, OpenLibrary or Audnex in one go.
          </DialogPrimitive.Description>

          {sheetTarget != null ? (
            <ConfigureSheet
              target={sheetTarget}
              groupId={groupId}
              onClose={() => setSheetTarget(null)}
            />
          ) : null}

          {/* Header */}
          <div className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Search className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold leading-tight text-foreground">
                Add to library
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Search AniList, MangaDex, ComicVine, OpenLibrary or Audnex in one go.
              </p>
            </div>
            <DialogPrimitive.Close className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span aria-hidden className="text-lg leading-none">
                ✕
              </span>
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Search input */}
          <div className="px-5 pt-4">
            <div className="flex h-11 items-center gap-3 rounded-xl border border-border bg-background px-3.5 transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title…"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {enabled && searchQuery.data ? (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {shown.length} results · {searchQuery.data.tookMs}ms
                </span>
              ) : null}
            </div>
          </div>

          {/* Type tabs, then the source label on its own row beneath them. */}
          <div className="flex flex-col gap-2 px-5 pb-3 pt-3">
            <ContentTypeFilter
              counts={enabled && searchQuery.data ? counts : ZERO_COUNTS}
              selected={activeType}
              onSelect={(v) => {
                setActiveType(v);
                setHighlight(0);
              }}
            />
            {srcLabel ? (
              <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                source: {srcLabel}
              </span>
            ) : null}
          </div>

          {/* Provider outage notice — non-blocking, shown when errors is non-empty */}
          {searchQuery.data?.errors && Object.keys(searchQuery.data.errors).length > 0 ? (
            <div className="mx-5 mb-1 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: 'var(--color-warn)' }}
              />
              <span className="font-mono text-[11px] text-muted-foreground">
                Some sources unavailable:{' '}
                {Object.keys(searchQuery.data.errors).join(', ')}
              </span>
            </div>
          ) : null}

          {/* Results */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
            {showEmpty ? (
              <div className="grid min-h-[220px] place-items-center px-6 text-center">
                <div className="max-w-xs">
                  <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Search className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Find something to add</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Type at least 3 characters to search every connected source.
                  </p>
                </div>
              </div>
            ) : searchQuery.isLoading ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-4">
                <RiffleLoader unit={56} caption={false} />
                <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                  searching every source…
                </span>
              </div>
            ) : shown.length === 0 ? (
              <div className="grid min-h-[220px] place-items-center px-6 text-center">
                <div className="max-w-xs">
                  <p className="text-sm font-medium text-foreground">No matches</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Nothing found for &quot;{debouncedQuery}&quot;. Try a different title or type.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-2 py-1">
                {shown.map((r, i) => (
                  <ResultRow
                    key={resultKey(r)}
                    result={r}
                    active={i === highlight}
                    inLib={isInLib(r)}
                    adding={addingKey === resultKey(r)}
                    onHover={() => setHighlight(i)}
                    onAdd={() => void quickAdd(r, { groupId })}
                    onConfigure={() => openConfigure(r)}
                    onMenuOpenChange={setSplitMenuOpen}
                    onView={() => {
                      onOpenChange(false);
                      router.push('/library');
                    }}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* "Add into" — library group target for both add paths (design ~3084). */}
          <div className="flex items-center gap-3 border-t border-border px-5 pt-3.5">
            <label className="shrink-0 text-[12.5px] font-medium text-foreground">Add into</label>
            <div className="w-[230px] shrink-0">
              <GroupPicker
                groups={groups}
                value={groupId}
                onChange={setGroupId}
                disabled={groupsLoading}
                testId="add-into-picker"
              />
            </div>
            <span className="min-w-0 truncate font-mono text-[10.5px] text-muted-foreground/70">
              defaults to Library root · applies to quick add and Add &amp; configure
            </span>
          </div>

          {/* Footer — adding happens per-row via the split button. */}
          <div className="flex items-center justify-end px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ResultRow({
  result,
  active,
  inLib,
  adding,
  onHover,
  onAdd,
  onConfigure,
  onMenuOpenChange,
  onView,
}: {
  result: DiscoverResult;
  active: boolean;
  inLib: boolean;
  adding: boolean;
  onHover: () => void;
  onAdd: () => void;
  onConfigure: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onView: () => void;
}): React.JSX.Element {
  const meta = metaLine(result);
  const ids = sourceIds(result);
  return (
    <li
      onMouseEnter={onHover}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border bg-background p-2.5 transition-colors',
        active && 'border-primary/60 bg-muted/40',
      )}
    >
      {/* Cover */}
      <div className="relative h-[72px] w-[52px] shrink-0 overflow-hidden rounded-md bg-muted">
        <Cover
          className="absolute inset-0"
          src={result.coverUrl}
          contentType={result.contentType}
          title={result.title}
          alt=""
        />
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-[15px] font-semibold text-foreground">
            {result.title}
          </span>
          <ContentTypePill type={result.contentType} className="shrink-0" />
        </div>
        {meta ? (
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{meta}</div>
        ) : null}
        <div className="mt-1 flex items-center gap-3">
          {ids ? (
            <span className="truncate font-mono text-[10.5px] text-muted-foreground/70">{ids}</span>
          ) : null}
          {inLib ? (
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: 'var(--color-ok)' }}
              />
              In library
            </span>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0">
        {inLib ? (
          <button
            type="button"
            onClick={onView}
            className="text-[13px] font-medium text-primary hover:underline"
          >
            View
          </button>
        ) : (
          <SplitAddButton
            adding={adding}
            onAdd={onAdd}
            onConfigure={onConfigure}
            onMenuOpenChange={onMenuOpenChange}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Split "Add" button: the primary action quick-adds with defaults; the caret
 * opens a small menu (portaled to the body so the results scroll container can't
 * clip it) exposing "Add to library" and "Add & configure".
 */
function SplitAddButton({
  adding,
  onAdd,
  onConfigure,
  onMenuOpenChange,
}: {
  adding: boolean;
  onAdd: () => void;
  onConfigure: () => void;
  onMenuOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Report open state up so the dialog can swallow Escape (close menu, not dialog).
  useEffect(() => {
    onMenuOpenChange(menuOpen);
  }, [menuOpen, onMenuOpenChange]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (): void => setMenuOpen(false);
    function onPointerDown(e: PointerEvent): void {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (document.getElementById('add-split-menu')?.contains(t)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      // The dialog's onEscapeKeyDown swallows the close; we just dismiss the menu.
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  function toggle(): void {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setMenuOpen((v) => !v);
  }

  const item =
    'flex w-full items-center rounded-md px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted';

  return (
    <div ref={wrapRef} className="flex items-center">
      <Button size="sm" disabled={adding} onClick={onAdd} className="rounded-r-none">
        {adding ? 'Adding…' : 'Add'}
      </Button>
      <Button
        size="sm"
        disabled={adding}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="More add options"
        className="rounded-l-none border-l border-primary-foreground/25 px-1.5"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', menuOpen && 'rotate-180')} />
      </Button>
      {menuOpen && pos
        ? createPortal(
            <div
              id="add-split-menu"
              role="menu"
              // Portaled to <body>, which the modal Radix Dialog sets to
              // pointer-events:none. Re-enable it here or the items aren't clickable.
              style={{ position: 'fixed', top: pos.top, right: pos.right, pointerEvents: 'auto' }}
              className="z-[60] min-w-[176px] overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setMenuOpen(false);
                  onAdd();
                }}
              >
                Add to library
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setMenuOpen(false);
                  onConfigure();
                }}
              >
                Add &amp; configure
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

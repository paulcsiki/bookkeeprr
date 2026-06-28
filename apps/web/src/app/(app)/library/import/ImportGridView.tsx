'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

// ── Domain types (mirror the Zod schemas in library-import; kept inline so
// this client component does not pull in the server-only schema module) ──────
type Candidate = {
  sourceId: string;
  title: string;
  author: string | null;
  year: number | null;
  isbn: string | null;
  coverUrl: string | null;
  source: 'openlibrary' | 'googlebooks';
};

type ScanItem = {
  path: string;
  detectedTitle: string;
  contentType: ContentType;
  files: string[];
  sizeBytes: number;
};

type MatchedItem = ScanItem & {
  best: Candidate | null;
  alternatives: Candidate[];
};

type QualityProfile = {
  id: number;
  name: string;
};

// ── Per-row state ─────────────────────────────────────────────────────────────
type RowState = {
  monitor: boolean;
  contentType: ContentType;
  qualityProfileId: number | null;
  chosenMatch: Candidate | null;
};

// ── Matched Book cell (own hook scope for per-row search) ─────────────────────
type MatchedBookCellProps = {
  item: MatchedItem;
  value: Candidate | null;
  onChange: (c: Candidate | null) => void;
};

function MatchedBookCell({
  item,
  value,
  onChange,
}: MatchedBookCellProps): React.JSX.Element {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the search query
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  // Close on outside click — capture phase so sibling menus that stopPropagation
  // still dismiss this dropdown (same pattern as NewGroupPopover).
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
        setDebouncedQ('');
      }
    }
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [open]);

  type DiscoverResult = {
    sourceId: string;
    title: string;
    author?: string | null;
    year?: number | null;
    isbn?: string | null;
    coverUrl?: string | null;
    source: string;
  };

  const searchQ = useQuery<DiscoverResult[]>({
    queryKey: ['import-book-search', debouncedQ],
    enabled: debouncedQ.length >= 3,
    queryFn: async () => {
      const r = await apiFetch(
        `/api/discover/search?q=${encodeURIComponent(debouncedQ)}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { results?: DiscoverResult[] };
      // Only keep OL/GB candidates — those are the only sources the import
      // API's Candidate schema accepts.
      return (data.results ?? []).filter(
        (r) => r.source === 'openlibrary' || r.source === 'googlebooks',
      );
    },
    staleTime: 30_000,
  });

  // All known candidates for this row — best + alternatives + any previously
  // searched-and-merged results so a picked search result persists in the list.
  const allCandidates = useMemo((): Candidate[] => {
    const seen = new Set<string>();
    const result: Candidate[] = [];
    const add = (c: Candidate) => {
      if (!seen.has(c.sourceId)) {
        seen.add(c.sourceId);
        result.push(c);
      }
    };
    if (item.best) add(item.best);
    item.alternatives.forEach(add);
    (searchQ.data ?? []).forEach((r) => {
      add({
        sourceId: r.sourceId,
        title: r.title,
        author: r.author ?? null,
        year: r.year ?? null,
        isbn: r.isbn ?? null,
        coverUrl: r.coverUrl ?? null,
        source: r.source as 'openlibrary' | 'googlebooks',
      });
    });
    return result;
  }, [item.best, item.alternatives, searchQ.data]);

  const selectCandidate = (c: Candidate) => {
    onChange(c);
    setQ('');
    setDebouncedQ('');
    setOpen(false);
  };

  // Build the external URL for a candidate's source
  function candidateUrl(c: Candidate): string {
    if (c.source === 'openlibrary') {
      return `https://openlibrary.org/works/${c.sourceId}`;
    }
    // googlebooks: strip the 'gb:' prefix the adapter prepends
    const id = c.sourceId.startsWith('gb:') ? c.sourceId.slice(3) : c.sourceId;
    return `https://books.google.com/books?id=${id}`;
  }

  // When the user has typed ≥ 3 chars switch to live search results;
  // otherwise show the pre-populated allCandidates list.
  const showSearch = debouncedQ.length >= 3;
  const dropdownItems: Candidate[] = showSearch
    ? (searchQ.data ?? []).map((r) => ({
        sourceId: r.sourceId,
        title: r.title,
        author: r.author ?? null,
        year: r.year ?? null,
        isbn: r.isbn ?? null,
        coverUrl: r.coverUrl ?? null,
        source: r.source as 'openlibrary' | 'googlebooks',
      }))
    : allCandidates;

  return (
    <div ref={containerRef} className="relative min-w-0">
      {/* ── Combobox trigger ─────────────────────────────────────────────── */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-8 w-full cursor-text items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs"
        onClick={() => setOpen(true)}
      >
        {open ? (
          /* Type-to-search input — IS the combobox trigger when open */
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            placeholder={value ? value.title : 'Search for a match…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                setQ('');
                setDebouncedQ('');
              }
            }}
          />
        ) : value ? (
          /* Closed + matched — title in its own span; sibling year/source
             badge makes the trigger div's textContent differ from the title
             alone so getByText(title) finds exactly one element in tests. */
          <>
            <span className="min-w-0 flex-1 truncate text-foreground">{value.title}</span>
            {value.year != null ? (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {value.year}
              </span>
            ) : (
              <span className="shrink-0 font-mono text-[9px] uppercase text-muted-foreground">
                {value.source === 'openlibrary' ? 'OL' : 'GB'}
              </span>
            )}
          </>
        ) : (
          /* Closed + no match */
          <span className="min-w-0 flex-1 truncate italic text-muted-foreground">
            No match (will skip)
          </span>
        )}
        <ChevronDown
          className="shrink-0 text-muted-foreground"
          width={12}
          height={12}
          aria-hidden
        />
      </div>

      {/* ── Dropdown ─────────────────────────────────────────────────────── */}
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] overflow-hidden rounded-md border border-border bg-card py-1 shadow-md"
        >
          {/* "No match (skip)" always at top */}
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              className="w-full px-2.5 py-1.5 text-left text-xs italic text-muted-foreground hover:bg-muted"
              onClick={() => {
                onChange(null);
                setOpen(false);
                setQ('');
                setDebouncedQ('');
              }}
            >
              No match (skip)
            </button>
          </li>

          <li role="separator">
            <div className="my-0.5 border-t border-border" />
          </li>

          {/* Loading indicator while live search is in-flight */}
          {showSearch && searchQ.isFetching && (
            <li className="px-2.5 py-1.5 text-xs text-muted-foreground">Searching…</li>
          )}

          {/* Empty state after a search that returned nothing */}
          {showSearch && searchQ.isSuccess && dropdownItems.length === 0 && (
            <li className="px-2.5 py-1.5 text-xs text-muted-foreground">No results found</li>
          )}

          {/* Candidate rows */}
          {dropdownItems.map((c) => (
            <li key={c.sourceId} className="group flex items-stretch">
              <button
                type="button"
                role="option"
                aria-selected={value?.sourceId === c.sourceId}
                className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => selectCandidate(c)}
              >
                <span className="text-foreground">{c.title}</span>
                {c.year != null && (
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    ({c.year})
                  </span>
                )}
                {c.author != null && (
                  <span className="ml-1 text-muted-foreground">— {c.author}</span>
                )}
              </button>
              {/* Source link — stopPropagation prevents row selection */}
              <a
                href={candidateUrl(c)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex shrink-0 items-center px-2 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                title={`View on ${c.source === 'openlibrary' ? 'Open Library' : 'Google Books'}`}
                tabIndex={-1}
              >
                <ExternalLink width={10} height={10} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
const MONITOR_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
] as const;

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  manga: 'Manga',
  comic: 'Comic',
  light_novel: 'Light Novel',
  ebook: 'eBook',
  audiobook: 'Audiobook',
};

export function ImportGridView(): React.JSX.Element {
  // ── Remote data ─────────────────────────────────────────────────────────────
  const scanQ = useQuery<{ items: MatchedItem[] }>({
    queryKey: ['import-scan'],
    queryFn: async () => {
      const r = await apiFetch('/api/library/import/scan', { method: 'POST' });
      if (!r.ok) throw new Error(`Scan failed: HTTP ${r.status}`);
      return r.json() as Promise<{ items: MatchedItem[] }>;
    },
    staleTime: Infinity, // Scan is a snapshot — don't refetch on window focus
    retry: 1,
  });

  const profilesQ = useQuery<QualityProfile[]>({
    queryKey: ['quality-profiles'],
    queryFn: async () => {
      const r = await apiFetch('/api/quality-profiles');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<QualityProfile[]>;
    },
    staleTime: 60_000,
  });

  const items: MatchedItem[] = scanQ.data?.items ?? [];
  const profiles: QualityProfile[] = profilesQ.data ?? [];
  const defaultProfileId: number | null = profiles[0]?.id ?? null;

  // ── Per-row state (keyed by path) ────────────────────────────────────────────
  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());

  // Seed row states when scan data arrives (or when profiles load so we have a
  // real default qualityProfileId).
  useEffect(() => {
    if (items.length === 0 || defaultProfileId === null) return;
    setRowStates((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        if (!next.has(item.path)) {
          next.set(item.path, {
            monitor: true,
            contentType: item.contentType,
            qualityProfileId: defaultProfileId,
            chosenMatch: item.best,
          });
        }
      }
      return next;
    });
  }, [items, defaultProfileId]);

  // Helper: get effective state for a row (falls back to defaults if not seeded yet)
  const getRowState = useCallback(
    (item: MatchedItem): RowState => {
      return (
        rowStates.get(item.path) ?? {
          monitor: true,
          contentType: item.contentType,
          qualityProfileId: defaultProfileId,
          chosenMatch: item.best,
        }
      );
    },
    [rowStates, defaultProfileId],
  );

  // Fix: default-construct the row on the fly if the seed effect hasn't fired
  // yet (e.g. user interacts with a Select before profilesQ resolves).
  const updateRow = useCallback(
    (path: string, update: Partial<RowState>) => {
      setRowStates((prev) => {
        const existing = prev.get(path);
        if (!existing) {
          const item = items.find((i) => i.path === path);
          if (!item) return prev;
          const defaultState: RowState = {
            monitor: true,
            contentType: item.contentType,
            qualityProfileId: defaultProfileId,
            chosenMatch: item.best,
          };
          return new Map(prev).set(path, { ...defaultState, ...update });
        }
        return new Map(prev).set(path, { ...existing, ...update });
      });
    },
    [items, defaultProfileId],
  );

  // ── Checked-path state (all paths checked by default when items load) ────────
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (items.length === 0) return;
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (!next.has(item.path)) next.add(item.path);
      }
      return next;
    });
  }, [items]);

  const allChecked =
    items.length > 0 && items.every((i) => checkedPaths.has(i.path));
  const someChecked = items.some((i) => checkedPaths.has(i.path));

  const toggleAll = useCallback(
    (checked: boolean | 'indeterminate') => {
      if (checked) {
        setCheckedPaths(new Set(items.map((i) => i.path)));
      } else {
        setCheckedPaths(new Set());
      }
    },
    [items],
  );

  const toggleRow = useCallback((path: string, checked: boolean | 'indeterminate') => {
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  }, []);

  // ── Bulk state ────────────────────────────────────────────────────────────────
  const [bulkMonitor, setBulkMonitor] = useState<string>('');
  const [bulkContentType, setBulkContentType] = useState<string>('');
  const [bulkQualityId, setBulkQualityId] = useState<string>('');

  const applyBulkMonitor = useCallback(
    (v: string) => {
      setBulkMonitor(v);
      const monitor = v === 'true';
      const checkedItems = items.filter((i) => checkedPaths.has(i.path));
      setRowStates((prev) => {
        const next = new Map(prev);
        for (const item of checkedItems) {
          const existing = next.get(item.path) ?? getRowState(item);
          next.set(item.path, { ...existing, monitor });
        }
        return next;
      });
    },
    [items, getRowState, checkedPaths],
  );

  const applyBulkContentType = useCallback(
    (v: string) => {
      setBulkContentType(v);
      const contentType = v as ContentType;
      const checkedItems = items.filter((i) => checkedPaths.has(i.path));
      setRowStates((prev) => {
        const next = new Map(prev);
        for (const item of checkedItems) {
          const existing = next.get(item.path) ?? getRowState(item);
          next.set(item.path, { ...existing, contentType });
        }
        return next;
      });
    },
    [items, getRowState, checkedPaths],
  );

  const applyBulkQuality = useCallback(
    (v: string) => {
      setBulkQualityId(v);
      const qualityProfileId = Number(v);
      const checkedItems = items.filter((i) => checkedPaths.has(i.path));
      setRowStates((prev) => {
        const next = new Map(prev);
        for (const item of checkedItems) {
          const existing = next.get(item.path) ?? getRowState(item);
          next.set(item.path, { ...existing, qualityProfileId });
        }
        return next;
      });
    },
    [items, getRowState, checkedPaths],
  );

  // ── Rows eligible for import (checked AND have a chosen match) ─────────────
  const importableRows = useMemo(
    () =>
      items.filter((item) => {
        if (!checkedPaths.has(item.path)) return false;
        const s = getRowState(item);
        return s.chosenMatch !== null;
      }),
    [items, getRowState, checkedPaths],
  );

  // ── Import mutation ───────────────────────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: async () => {
      const rows = importableRows.map((item) => {
        const s = getRowState(item);
        return {
          item: {
            path: item.path,
            detectedTitle: item.detectedTitle,
            contentType: s.contentType,
            files: item.files,
            sizeBytes: item.sizeBytes,
          },
          match: s.chosenMatch!,
          monitor: s.monitor,
          qualityProfileId: s.qualityProfileId ?? defaultProfileId ?? 1,
        };
      });
      const r = await apiFetch('/api/library/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<{
        imported: number;
        seriesIds: number[];
        skipped: { path: string; reason: string }[];
      }>;
    },
    onSuccess: (data) => {
      const skippedCount = data.skipped?.length ?? 0;
      const msg = `Imported ${data.imported} file${data.imported === 1 ? '' : 's'} across ${data.seriesIds.length} series`;
      toast.success(skippedCount > 0 ? `${msg} (${skippedCount} skipped)` : msg);
      // Reload scan to reflect the newly tracked files
      void scanQ.refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Render ────────────────────────────────────────────────────────────────────
  if (scanQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Scanning library roots…
      </div>
    );
  }

  if (scanQ.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-destructive text-sm">
        <p>Scan failed: {(scanQ.error as Error).message}</p>
        <Button variant="outline" size="sm" onClick={() => void scanQ.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        No untracked files found — your library is fully up to date.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox
                aria-label="Select all"
                checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead>Folder</TableHead>
            <TableHead className="w-28">Monitor</TableHead>
            <TableHead className="w-36">Content type</TableHead>
            <TableHead className="w-40">Quality profile</TableHead>
            <TableHead>Matched book</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const s = getRowState(item);
            const isChecked = checkedPaths.has(item.path);
            return (
              <TableRow key={item.path}>
                {/* Checkbox */}
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${item.detectedTitle}`}
                    checked={isChecked}
                    onCheckedChange={(checked) => toggleRow(item.path, checked)}
                  />
                </TableCell>

                {/* Folder */}
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm">
                      {item.detectedTitle}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground truncate max-w-xs">
                      {item.path}
                    </span>
                  </div>
                </TableCell>

                {/* Monitor */}
                <TableCell>
                  <Select
                    value={s.monitor ? 'true' : 'false'}
                    onValueChange={(v) =>
                      updateRow(item.path, { monitor: v === 'true' })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONITOR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* Content type */}
                <TableCell>
                  <Select
                    value={s.contentType}
                    onValueChange={(v) =>
                      updateRow(item.path, { contentType: v as ContentType })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {CONTENT_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* Quality profile */}
                <TableCell>
                  <Select
                    value={s.qualityProfileId != null ? String(s.qualityProfileId) : ''}
                    onValueChange={(v) =>
                      updateRow(item.path, { qualityProfileId: Number(v) })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {/* Matched book */}
                <TableCell>
                  <MatchedBookCell
                    item={item}
                    value={s.chosenMatch}
                    onChange={(c) => updateRow(item.path, { chosenMatch: c })}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Bulk footer */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground mr-1">
          Apply to checked:
        </span>

        {/* Bulk monitor */}
        <Select value={bulkMonitor} onValueChange={applyBulkMonitor}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue placeholder="Monitor…" />
          </SelectTrigger>
          <SelectContent>
            {MONITOR_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Bulk content type */}
        <Select value={bulkContentType} onValueChange={applyBulkContentType}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Content type…" />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {CONTENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Bulk quality profile */}
        <div data-testid="bulk-quality-select-wrapper">
          <Select value={bulkQualityId} onValueChange={applyBulkQuality}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Quality profile…" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto">
          <Button
            size="sm"
            disabled={importableRows.length === 0 || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending
              ? 'Importing…'
              : `Import ${importableRows.length} item${importableRows.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

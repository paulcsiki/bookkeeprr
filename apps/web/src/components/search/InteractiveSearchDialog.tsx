'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Search, Server } from 'lucide-react';
import { toast } from 'sonner';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VirtualList } from '@/components/ui/virtual-list';
import { apiFetch } from '@/lib/api-fetch';

type SearchResult = {
  item: {
    guid: string;
    title: string;
    link: string;
    seeders: number;
    leechers: number;
    sizeBytes: number;
    publishedAt: string;
    indexerId: number;
    indexerName: string;
    indexerKind: string;
    infoUrl: string | null;
    freeleech?: boolean;
    vip?: boolean;
  };
  parsed: {
    targetKind: 'volume' | 'chapter' | 'batch';
    targetLow: number | null;
    targetHigh: number | null;
    group: string | null;
    language: 'en' | 'jp';
    isBatch: boolean;
  };
  matchResult: { matches: true; score: number } | { matches: false; reason: string };
  ownership: 'none' | 'in-library' | 'downloading';
  releaseId: number | null;
};

type Props = {
  seriesId: number;
  defaultQuery?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024).toFixed(0)} KiB`;
}

function formatTarget(p: SearchResult['parsed']): string {
  if (p.targetLow === null) return p.targetKind;
  if (p.targetHigh && p.targetHigh !== p.targetLow)
    return `${p.targetKind} ${p.targetLow}-${p.targetHigh}`;
  return `${p.targetKind} ${p.targetLow}`;
}

function resultKey(r: SearchResult): string {
  return `${r.item.indexerId}:${r.item.guid}`;
}

// Plain-language explanations for why a release didn't auto-match.
const REASON_HELP: Record<string, string> = {
  'granularity-mismatch':
    'The release is grouped differently than how this series is tracked (e.g. per-chapter vs per-volume), so it cannot be auto-matched. You can still force grab it.',
  'title-mismatch': "The release title doesn't look like this series.",
  'content-type-mismatch':
    'This release is a different content type (e.g. manga) than this series. You can still force grab it.',
  language: "The release language isn't allowed by this series' quality profile.",
  size: "The release size is outside this quality profile's allowed range.",
  'adult-filter': 'Blocked by your adult-content filter.',
};

// design-system .dtable: shared column grid; header + body styled separately.
const COLS = 'grid grid-cols-[minmax(0,1.8fr)_6rem_5rem_4.5rem_8.5rem_6rem_7rem] gap-3';
const HEAD_ROW = `${COLS} items-center bg-elevated px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground`;
const BODY_ROW = `${COLS} items-center border-t border-border px-4 py-3 text-[13px] text-foreground/80`;

export function InteractiveSearchDialog({
  seriesId,
  defaultQuery,
  open,
  onOpenChange,
}: Props): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(defaultQuery ?? '');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  // Key of the result whose grab is in flight.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // Keys force-grab-confirmed in this session (so the row's button stays armed).
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  // Keys we've already grabbed in this session — drives optimistic "grabbed".
  const [grabbedKeys, setGrabbedKeys] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const search = useMutation({
    mutationFn: async (queryOverride?: string) => {
      const r = await apiFetch('/api/search/interactive', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seriesId, queryOverride }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<{ results: SearchResult[]; errors: unknown[] }>;
    },
    onSuccess: (data) => {
      setResults(data.results);
      setConfirmKey(null);
      if (data.results.length === 0) toast.message('No results.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Reset transient state on close; reseed the query and auto-run the search on
  // open so the user sees results immediately (they can still refine + re-search).
  const runSearchMutation = search.mutate;
  useEffect(() => {
    if (open) {
      setQuery(defaultQuery ?? '');
      runSearchMutation(undefined);
    } else {
      setResults(null);
      setPendingKey(null);
      setConfirmKey(null);
      setGrabbedKeys(new Set());
    }
  }, [open, defaultQuery, runSearchMutation]);

  const grab = useMutation({
    mutationFn: async (r: SearchResult) => {
      setPendingKey(resultKey(r));
      const score = r.matchResult.matches ? r.matchResult.score : null;
      const resp = await apiFetch('/api/search/interactive/grab', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          seriesId,
          item: {
            guid: r.item.guid,
            title: r.item.title,
            link: r.item.link,
            seeders: r.item.seeders,
            leechers: r.item.leechers,
            sizeBytes: r.item.sizeBytes,
            publishedAt: r.item.publishedAt,
            indexerId: r.item.indexerId,
          },
          parsed: r.parsed,
          score,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${resp.status}`);
      return resultKey(r);
    },
    onSuccess: (key) => {
      toast.success('Grabbed');
      setGrabbedKeys((s) => new Set(s).add(key));
      // Reflect the new download in the Releases tab and Activity views.
      void qc.invalidateQueries({ queryKey: ['series-releases', seriesId] });
      void qc.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      setPendingKey(null);
      setConfirmKey(null);
    },
  });

  function runSearch(): void {
    setConfirmKey(null);
    search.mutate(query.trim() || undefined);
  }

  function onGrabClick(r: SearchResult): void {
    const key = resultKey(r);
    if (!r.matchResult.matches && confirmKey !== key) {
      // First click on a force-grab: arm the confirm.
      setConfirmKey(key);
      return;
    }
    grab.mutate(r);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">Interactive search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search indexers live for this series and grab any release.
          </DialogPrimitive.Description>

          {/* Header */}
          <div className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Search className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold leading-tight text-foreground">
                Interactive search
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Releases are scored against this series&apos; quality profile. Non-matches appear at
                the bottom with reasons.
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
          <div className="flex items-center gap-3 px-5 pt-4">
            <div className="flex h-11 flex-1 items-center gap-3 rounded-xl border border-border bg-background px-3.5 transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !search.isPending) runSearch();
                }}
                placeholder="Search query (default: derived from series title + extras)"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button onClick={runSearch} disabled={search.isPending}>
              {search.isPending ? 'Searching…' : 'Search'}
            </Button>
          </div>

          {/* Results */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-4">
            {results == null ? (
              <div className="grid min-h-[220px] place-items-center px-6 text-center">
                <div className="max-w-xs">
                  <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Search className={`h-4 w-4 ${search.isPending ? 'animate-pulse' : ''}`} />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {search.isPending ? 'Searching indexers…' : 'Search indexers live'}
                  </p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {search.isPending
                      ? 'Querying every known title for this series.'
                      : 'Run a search to see releases for this series.'}
                  </p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="grid min-h-[220px] place-items-center px-6 text-center">
                <p className="text-sm font-medium text-foreground">No results</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-elevated">
                {/* Column header */}
                <div className={HEAD_ROW}>
                  <span>Title</span>
                  <span>Target</span>
                  <span>Size</span>
                  <span>Seeders</span>
                  <span>Match / Reason</span>
                  <span>Ownership</span>
                  <span>Action</span>
                </div>

                <VirtualList
                  items={results}
                  estimateSize={() => 80}
                  keyExtractor={(r) => resultKey(r)}
                  className="h-[520px]"
                  renderItem={(r) => {
                    const key = resultKey(r);
                    const isMatch = r.matchResult.matches;
                    const grabbed = grabbedKeys.has(key);
                    const pending = pendingKey === key;
                    const owned = r.ownership === 'in-library' || r.ownership === 'downloading';
                    const disabled = owned || pending || grabbed;
                    const armed = confirmKey === key;
                    return (
                      <div
                        className={`${BODY_ROW} min-h-[80px] hover:bg-hover ${isMatch ? '' : 'opacity-70'}`}
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex min-w-0 items-center gap-2">
                            {r.item.infoUrl ? (
                              <a
                                href={r.item.infoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={r.item.title}
                                className="truncate hover:underline"
                              >
                                {r.item.title}
                              </a>
                            ) : (
                              <span className="truncate" title={r.item.title}>
                                {r.item.title}
                              </span>
                            )}
                            <a
                              href={r.item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Download .torrent"
                              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">Download .torrent</span>
                            </a>
                          </span>
                          <span
                            className="flex items-center gap-1 text-[11px] text-muted-foreground"
                            title={`${r.item.indexerName} (${r.item.indexerKind})`}
                          >
                            <Server className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate font-mono">{r.item.indexerName}</span>
                          </span>
                          {(r.item.freeleech || r.item.vip) && (
                            <span className="flex items-center gap-1">
                              {r.item.freeleech && (
                                <Badge
                                  className="border-transparent font-mono text-[10px]"
                                  style={{
                                    backgroundColor: 'var(--color-ok)',
                                    color: 'var(--color-background)',
                                  }}
                                >
                                  FREE
                                </Badge>
                              )}
                              {r.item.vip && (
                                <Badge
                                  className="border-transparent font-mono text-[10px]"
                                  style={{
                                    backgroundColor: 'var(--color-info)',
                                    color: 'var(--color-background)',
                                  }}
                                >
                                  VIP
                                </Badge>
                              )}
                            </span>
                          )}
                        </span>
                        <span className="font-mono">{formatTarget(r.parsed)}</span>
                        <span className="font-mono">{formatSize(r.item.sizeBytes)}</span>
                        <span className="font-mono">{r.item.seeders}</span>
                        <span>
                          {r.matchResult.matches ? (
                            <Badge>score {r.matchResult.score.toFixed(0)}</Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="cursor-help"
                              title={REASON_HELP[r.matchResult.reason] ?? r.matchResult.reason}
                            >
                              {r.matchResult.reason}
                            </Badge>
                          )}
                        </span>
                        <span>
                          {r.ownership === 'in-library' ? (
                            <Badge>In library</Badge>
                          ) : r.ownership === 'downloading' ? (
                            <Badge variant="outline">Downloading</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                        <span>
                          {isMatch ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={disabled}
                              onClick={() => onGrabClick(r)}
                            >
                              {pending ? 'Grabbing…' : grabbed ? 'Grabbed' : 'Grab'}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={disabled}
                              onClick={() => onGrabClick(r)}
                              onMouseLeave={() => {
                                if (armed && !pending) setConfirmKey(null);
                              }}
                              className="border-warn/60 text-warn hover:bg-warn/10 hover:text-warn"
                            >
                              {pending
                                ? 'Grabbing…'
                                : grabbed
                                  ? 'Grabbed'
                                  : armed
                                    ? 'Confirm?'
                                    : 'Force grab'}
                            </Button>
                          )}
                        </span>
                      </div>
                    );
                  }}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

type HydrationStatus = {
  /** True while any background job for the series is pending/running. */
  running?: boolean;
  /** Distinct kinds of active jobs (hydrate / chapter sync / volume / import). */
  kinds?: string[];
  /** Back-compat alias of `running`. */
  hydrating?: boolean;
};

const POLL_MS = 2_000;
// Stop polling after ~5 min so a stuck/never-clearing signal can't poll forever.
const MAX_POLLS = 150;
// Refresh server data + invalidate query-backed tabs every Nth poll while active.
const REFRESH_EVERY = 3; // ~6s at POLL_MS = 2000

const FETCHING_META = new Set([
  'metadata_hydrate',
  'comicvine_hydrate',
  'novel_updates_hydrate',
]);
const SYNCING_CHAPTERS = new Set(['novel_updates_chapter_sync', 'mangadex_chapter_sync']);
const FETCHING_VOLUMES = new Set(['mangadex_volume_hydrate']);
const FETCHING_RELEASES = new Set(['series_release_search']);
const IMPORTING = new Set(['import']);

/**
 * Friendly label for the activity pill, derived from the active job kinds.
 *
 * A single homogeneous group of kinds maps to its specific verb; a mix of
 * groups collapses to the generic "Working…". An empty/unknown set falls back
 * to "Fetching details…" (the historical copy + back-compat with callers that
 * only report `{ hydrating }`).
 */
export function activityLabel(kinds: readonly string[]): string {
  if (kinds.length === 0) return 'Fetching details…';
  const groups = new Set<string>();
  for (const k of kinds) {
    if (FETCHING_META.has(k)) groups.add('meta');
    else if (SYNCING_CHAPTERS.has(k)) groups.add('chapters');
    else if (FETCHING_VOLUMES.has(k)) groups.add('volumes');
    else if (FETCHING_RELEASES.has(k)) groups.add('releases');
    else if (IMPORTING.has(k)) groups.add('import');
    else groups.add('other');
  }
  if (groups.size !== 1) return 'Working…';
  const [only] = groups;
  switch (only) {
    case 'meta':
      return 'Fetching metadata…';
    case 'chapters':
      return 'Syncing chapters…';
    case 'volumes':
      return 'Fetching volumes…';
    case 'releases':
      return 'Searching releases…';
    case 'import':
      return 'Importing…';
    default:
      return 'Working…';
  }
}

/**
 * Small activity pill shown on the series page while a background job for the
 * series (metadata/volume hydrate, chapter sync, import) is active. Polls
 * `GET …/hydration-status` every ~2s; the label reflects what's running. When
 * the signal flips from running→idle it refreshes the route once (to render the
 * freshly-hydrated title/cover/description/volumes) and stops. Renders nothing
 * when nothing is running (established/idle series).
 */
export function HydrationIndicator({ seriesId }: { seriesId: number }): React.JSX.Element | null {
  const router = useRouter();
  const qc = useQueryClient();
  const polls = useRef(0);
  const wasRunning = useRef(false);
  const refreshed = useRef(false);
  const [stopped, setStopped] = useState(false);

  // Refresh the server-rendered tree (covers/volumes come from server props)
  // AND invalidate the React-Query-backed tabs (ReleasesTab → `series-releases`,
  // ChaptersTab → `series-toc`) so they re-fetch the freshly-hydrated data.
  const refreshAll = useCallback(() => {
    router.refresh();
    void qc.invalidateQueries({ queryKey: ['series-releases', seriesId] });
    void qc.invalidateQueries({ queryKey: ['series-toc', seriesId] });
  }, [router, qc, seriesId]);

  const { data } = useQuery<HydrationStatus, Error>({
    queryKey: ['hydration-status', seriesId],
    queryFn: async () => {
      polls.current += 1;
      const r = await apiFetch(`/api/series/${seriesId}/hydration-status`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<HydrationStatus>;
    },
    // Poll while active; the effect below stops it once activity settles or the
    // poll cap is hit.
    refetchInterval: stopped ? false : POLL_MS,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
  });

  const running = data !== undefined && (data.running ?? data.hydrating) === true;
  const kinds = data?.kinds ?? [];

  useEffect(() => {
    if (data === undefined) return;
    if (running) {
      wasRunning.current = true;
      // Pull freshly-hydrated covers/volumes (server tree) + releases/toc
      // (query caches) as they trickle in, not just at the end.
      if (polls.current % REFRESH_EVERY === 0) refreshAll();
      if (polls.current >= MAX_POLLS) setStopped(true);
      return;
    }
    // Not running. If it had been running, the job just settled — pull the
    // server-rendered page + query-backed tabs fresh once, then stop polling.
    if (wasRunning.current && !refreshed.current) {
      refreshed.current = true;
      refreshAll();
    }
    setStopped(true);
  }, [data, running, refreshAll]);

  if (!running) return null;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-2.5 py-1"
      role="status"
      aria-live="polite"
    >
      <span className="spinner" style={{ width: 12, height: 12 }} aria-hidden="true" />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {activityLabel(kinds)}
      </span>
    </span>
  );
}

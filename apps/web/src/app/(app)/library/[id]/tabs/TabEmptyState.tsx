'use client';

import { useQuery } from '@tanstack/react-query';
import { Boxes, Layers, Search } from 'lucide-react';
import { EmptyState } from '@bookkeeprr/ui';
import { apiFetch } from '@/lib/api-fetch';

type HydrationStatus = { running?: boolean; kinds?: string[]; hydrating?: boolean };

const VOLUME_KINDS = new Set([
  'mangadex_volume_hydrate',
  'metadata_hydrate',
  'comicvine_hydrate',
  'novel_updates_hydrate',
]);
const CHAPTER_KINDS = new Set(['novel_updates_chapter_sync', 'mangadex_chapter_sync']);

/**
 * Polls the shared `hydration-status` query (deduped with HydrationIndicator via
 * the identical queryKey). Returns the active kinds; never throws into render.
 */
function useActiveJobKinds(seriesId: number): string[] {
  const { data } = useQuery<HydrationStatus, Error>({
    queryKey: ['hydration-status', seriesId],
    queryFn: async () => {
      const r = await apiFetch(`/api/series/${seriesId}/hydration-status`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<HydrationStatus>;
    },
    refetchInterval: 2_000,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  return data?.kinds ?? [];
}

/** Small inline spinner + label, token-styled, for the "working" empty variant. */
function WorkingState({ label }: { label: string }): React.JSX.Element {
  return (
    <div
      className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <span className="spinner" style={{ width: 14, height: 14 }} aria-hidden="true" />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/**
 * Empty state for the Volumes tab when the series has zero volumes.
 *
 * If a volume/metadata job is running → a "Fetching volumes…" spinner. Otherwise
 * a steady hint: volumes are created on grab+import, so 0 volumes at rest is
 * expected for volume-granularity series (esp. NovelUpdates novels).
 */
export function VolumesEmptyState({ seriesId }: { seriesId: number }): React.JSX.Element {
  const kinds = useActiveJobKinds(seriesId);
  const working = kinds.some((k) => VOLUME_KINDS.has(k));
  if (working) return <WorkingState label="Fetching volumes…" />;
  return (
    <EmptyState
      staged={false}
      variant="muted"
      icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
      title="No volumes yet"
      body="Volumes are created when you grab and import a release."
      className="mt-4"
    />
  );
}

/**
 * Empty state for the Releases tab when no releases are cached.
 *
 * If a sync job is running → "Syncing chapters…" spinner. Otherwise an
 * actionable idle hint pointing at Interactive search.
 */
export function ReleasesEmptyState({ seriesId }: { seriesId: number }): React.JSX.Element {
  const kinds = useActiveJobKinds(seriesId);
  const working = kinds.some((k) => CHAPTER_KINDS.has(k));
  if (working) return <WorkingState label="Syncing chapters…" />;
  return (
    <EmptyState
      staged={false}
      variant="muted"
      icon={<Layers className="h-5 w-5" aria-hidden="true" />}
      title="No releases yet"
      body="Run an Interactive search to find some."
      hint={
        <span className="inline-flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Interactive search lives in the header.
        </span>
      }
      className="mt-4"
    />
  );
}

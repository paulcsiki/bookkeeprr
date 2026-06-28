'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Pause, Play, Trash2, X } from 'lucide-react';
import { EmptyState } from '@bookkeeprr/ui';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-fetch';

type ActivityRow = {
  id: number;
  qbtHash: string;
  status:
    | 'queued'
    | 'downloading'
    | 'completed'
    | 'importing'
    | 'imported'
    | 'failed'
    | 'superseded';
  addedAt: string;
  completedAt: string | null;
  importedAt: string | null;
  error: string | null;
  // Live qBittorrent transfer stats (null when not active / qbt off)
  progress?: number | null;
  downloadSpeed?: number | null;
  eta?: number | null;
  seeds?: number | null;
  sizeBytes?: number | null;
  release: {
    id: number;
    title: string;
    indexerGuid: string;
    indexerName: string | null;
    indexerKind: string | null;
  } | null;
  series: { id: number; title: string } | null;
};

type Filter = 'all' | 'active' | 'done' | 'failed';

const ACTIVE: ReadonlySet<string> = new Set(['queued', 'downloading', 'importing']);
const DONE: ReadonlySet<string> = new Set(['completed', 'superseded']);

function StatusBadge({ status }: { status: ActivityRow['status'] }): React.JSX.Element {
  // Defensive: imported rows are filtered out of the list (see `visible`), so this
  // never renders today — kept so the badge stays correct if that ever changes.
  if (status === 'imported') return <Badge>Imported</Badge>;
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (status === 'queued') return <Badge variant="outline">Queued</Badge>;
  if (status === 'downloading') return <Badge variant="outline">Downloading</Badge>;
  if (status === 'completed') return <Badge variant="outline">Completed</Badge>;
  if (status === 'superseded') {
    // A redundant sibling cancelled after a better release imported. Neutral
    // solid badge (not destructive — nothing went wrong), tooltip explains why.
    return (
      <Badge variant="secondary" title="replaced by a better release">
        Superseded
      </Badge>
    );
  }
  return <Badge variant="outline">Importing</Badge>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function fmtSpeed(bytesPerSec: number | null | undefined): string {
  if (bytesPerSec == null) return '';
  const kib = bytesPerSec / 1024;
  if (kib < 1024) return `${Math.round(kib)} KiB/s`;
  return `${(kib / 1024).toFixed(1)} MiB/s`;
}

function fmtEta(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '';
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function ProgressBar({ progress }: { progress: number }): React.JSX.Element {
  const pct = Math.round(progress * 100);
  return (
    <div className="flex items-center gap-2 mt-1">
      <div
        className="relative h-1 flex-1 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-muted)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: 'var(--color-primary)',
          }}
        />
      </div>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

function ControlButtons({
  row,
  onPause,
  onResume,
  onCancel,
  isPausing,
  isResuming,
  isCancelling,
}: {
  row: ActivityRow;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  isPausing: boolean;
  isResuming: boolean;
  isCancelling: boolean;
}): React.JSX.Element | null {
  if (row.status !== 'downloading' && row.status !== 'queued' && row.status !== 'paused' as string) {
    return null;
  }
  const isPaused = row.status === ('paused' as string);
  return (
    <div className="flex items-center gap-1">
      {!isPaused ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={isPausing}
          onClick={onPause}
          title="Pause"
        >
          <Pause className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={isResuming}
          onClick={onResume}
          title="Resume"
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-destructive hover:text-destructive"
        disabled={isCancelling}
        onClick={onCancel}
        title="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ActivityList(): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<{ downloads: ActivityRow[] }>({
    queryKey: ['downloads'],
    queryFn: async () => {
      const r = await apiFetch('/api/downloads');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ downloads: ActivityRow[] }>;
    },
    refetchInterval: 10_000,
  });

  // Surface the server's error message (JSON `{message}`) when present, falling
  // back to the HTTP status, so action failures aren't silent.
  async function errorMessage(r: Response, fallback: string): Promise<string> {
    const body = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
    return body?.message ?? body?.error ?? `${fallback} (HTTP ${r.status})`;
  }

  const pauseMutation = useMutation({
    mutationFn: async (hash: string) => {
      const r = await apiFetch(`/api/downloads/${hash}/pause`, { method: 'POST' });
      if (!r.ok) throw new Error(await errorMessage(r, 'Pause failed'));
    },
    onSuccess: () => {
      toast.success('Paused');
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resumeMutation = useMutation({
    mutationFn: async (hash: string) => {
      const r = await apiFetch(`/api/downloads/${hash}/resume`, { method: 'POST' });
      if (!r.ok) throw new Error(await errorMessage(r, 'Resume failed'));
    },
    onSuccess: () => {
      toast.success('Resumed');
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (hash: string) => {
      const r = await apiFetch(`/api/downloads/${hash}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await errorMessage(r, 'Cancel failed'));
    },
    onSuccess: () => {
      toast.success('Download canceled');
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Clear a terminal (failed / completed) row from the activity feed. Same
  // endpoint as cancel (removes the torrent + the download row), just worded as
  // a dismissal since nothing is in flight.
  const clearMutation = useMutation({
    mutationFn: async (hash: string) => {
      const r = await apiFetch(`/api/downloads/${hash}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await errorMessage(r, 'Clear failed'));
    },
    onSuccess: () => {
      toast.success('Cleared');
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Bulk-clear every failed row in one click. Best-effort per item; reports how
  // many couldn't be cleared and still refreshes so the cleared ones disappear.
  const bulkClearMutation = useMutation({
    mutationFn: async (hashes: string[]) => {
      const results = await Promise.allSettled(
        hashes.map((h) => apiFetch(`/api/downloads/${h}`, { method: 'DELETE' })),
      );
      const failures = results.filter(
        (res) => res.status === 'rejected' || (res.status === 'fulfilled' && !res.value.ok),
      ).length;
      if (failures > 0) throw new Error(`${failures} of ${hashes.length} could not be cleared`);
    },
    onSuccess: () => {
      toast.success('Cleared failed items');
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (isError || !data) return <p className="text-destructive">Failed to load downloads.</p>;

  // Imported items leave the active Activity view (Radarr/Sonarr behavior). The
  // import is finished; it belongs to the library now, not the activity feed.
  const visible = data.downloads.filter((r) => r.status !== 'imported');

  if (visible.length === 0) {
    return (
      <EmptyState
        variant="ok"
        icon={<CheckCircle2 />}
        title="All caught up"
        body="No pending grabs, no missing volumes, no failures. The worker last scanned a few minutes ago."
      />
    );
  }

  const filtered = visible.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'active') return ACTIVE.has(r.status);
    if (filter === 'done') return DONE.has(r.status);
    return r.status === 'failed';
  });

  // Failed rows that can be cleared in bulk (every download row carries a hash).
  const failedHashes = visible
    .filter((r) => r.status === 'failed' && r.qbtHash)
    .map((r) => r.qbtHash);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        {(['all', 'active', 'done', 'failed'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-sm rounded border ${filter === f ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'done' ? 'Done' : 'Failed'}
          </button>
        ))}
        {failedHashes.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={bulkClearMutation.isPending}
            onClick={() => bulkClearMutation.mutate(failedHashes)}
            title="Remove all failed items from qBittorrent and the activity feed"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Clear failed ({failedHashes.length})
          </Button>
        )}
      </div>

      <Card className="p-4">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th>Series</th>
              <th>Release</th>
              <th>Status / Progress</th>
              <th>Added</th>
              <th>Completed</th>
              <th>Imported</th>
              <th>Error</th>
              <th className="sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2 pr-3">
                  {r.series ? (
                    <Link href={`/library/${r.series.id}`} className="hover:underline">
                      {r.series.title}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="max-w-md py-2 pr-3" title={r.release?.indexerGuid ?? ''}>
                  <span className="flex min-w-0 items-center gap-2">
                    {r.release?.indexerKind === 'manual' && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]"
                        title="Added manually (not from an indexer)"
                      >
                        MANUAL
                      </Badge>
                    )}
                    <span className="truncate">{r.release?.title ?? '—'}</span>
                  </span>
                </td>
                <td className="py-2 pr-3 min-w-[160px]">
                  <StatusBadge status={r.status} />
                  {r.status === 'downloading' && r.progress != null && (
                    <div className="mt-1">
                      <ProgressBar progress={r.progress} />
                      {(r.downloadSpeed != null || r.eta != null) && (
                        <p className="font-mono text-xs text-muted-foreground mt-0.5 space-x-2">
                          {r.downloadSpeed != null && (
                            <span>{fmtSpeed(r.downloadSpeed)}</span>
                          )}
                          {r.eta != null && r.eta > 0 && (
                            <span>{fmtEta(r.eta)}</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3">{fmtDate(r.addedAt)}</td>
                <td className="py-2 pr-3">{fmtDate(r.completedAt)}</td>
                <td className="py-2 pr-3">{fmtDate(r.importedAt)}</td>
                <td className="max-w-xs py-2 pr-3">
                  {r.error ? (
                    <details>
                      <summary className="text-destructive cursor-pointer">
                        {r.error.slice(0, 60)}
                        {r.error.length > 60 ? '…' : ''}
                      </summary>
                      <pre className="text-xs whitespace-pre-wrap mt-1">{r.error}</pre>
                    </details>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1">
                    <ControlButtons
                      row={r}
                      onPause={() =>
                        r.qbtHash
                          ? pauseMutation.mutate(r.qbtHash)
                          : toast.error('No torrent hash yet — try again in a moment')
                      }
                      onResume={() =>
                        r.qbtHash
                          ? resumeMutation.mutate(r.qbtHash)
                          : toast.error('No torrent hash yet — try again in a moment')
                      }
                      onCancel={() =>
                        r.qbtHash
                          ? cancelMutation.mutate(r.qbtHash)
                          : toast.error('No torrent hash yet — try again in a moment')
                      }
                      isPausing={pauseMutation.isPending && pauseMutation.variables === r.qbtHash}
                      isResuming={resumeMutation.isPending && resumeMutation.variables === r.qbtHash}
                      isCancelling={cancelMutation.isPending && cancelMutation.variables === r.qbtHash}
                    />
                    {(r.status === 'failed' || r.status === 'completed' || r.status === 'superseded') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        disabled={clearMutation.isPending && clearMutation.variables === r.qbtHash}
                        onClick={() =>
                          r.qbtHash
                            ? clearMutation.mutate(r.qbtHash)
                            : toast.error('Nothing to clear')
                        }
                        title="Remove from qBittorrent and clear from activity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

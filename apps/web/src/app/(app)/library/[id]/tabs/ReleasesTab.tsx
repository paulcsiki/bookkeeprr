'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Server } from 'lucide-react';
import { SkeletonListRow } from '@bookkeeprr/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VirtualList } from '@/components/ui/virtual-list';
import { apiFetch } from '@/lib/api-fetch';
import { ReleasesEmptyState } from './TabEmptyState';

// design-system .dtable: shared column grid; header + body styled separately.
const COLS = 'grid grid-cols-[1fr_8rem_7rem_5rem_5rem_5rem_7rem_8rem_6rem] gap-3';
const HEAD_ROW = `${COLS} items-center bg-elevated px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground`;
const BODY_ROW = `${COLS} items-center border-t border-border px-4 py-3 text-[13px] text-foreground/80`;

type Row = {
  id: number;
  title: string;
  link: string;
  groupName: string | null;
  language: string | null;
  targetKind: 'volume' | 'chapter' | 'batch';
  targetLow: number | null;
  targetHigh: number | null;
  sizeBytes: number;
  seeders: number;
  publishedAt: string;
  score: number | null;
  ownership: 'none' | 'in-library' | 'downloading';
  indexerName: string | null;
  indexerKind: string | null;
};

function formatTarget(r: Row): string {
  if (r.targetLow === null) return r.targetKind;
  if (r.targetHigh === null || r.targetHigh === r.targetLow)
    return `${r.targetKind} ${r.targetLow}`;
  return `${r.targetKind} ${r.targetLow}-${r.targetHigh}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024).toFixed(0)} KiB`;
}

type Props = { seriesId: number };

export function ReleasesTab({ seriesId }: Props): React.JSX.Element {
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<{ releases: Row[] }>({
    queryKey: ['series-releases', seriesId],
    queryFn: async () => {
      const r = await apiFetch(`/api/series/${seriesId}/releases`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const grabMutation = useMutation({
    mutationFn: async (releaseId: number) => {
      setPendingId(releaseId);
      const r = await apiFetch(`/api/releases/${releaseId}/grab`, { method: 'POST' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
      return body;
    },
    onSuccess: () => {
      toast.success('Grabbed');
      void qc.invalidateQueries({ queryKey: ['series-releases', seriesId] });
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setPendingId(null),
  });

  if (isLoading)
    return (
      <div className="overflow-hidden rounded-md border border-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonListRow key={i} />
        ))}
      </div>
    );
  if (isError || !data) return <p className="text-destructive">Failed to load releases.</p>;
  if (data.releases.length === 0) {
    return <ReleasesEmptyState seriesId={seriesId} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-elevated">
      {/* Column header */}
      <div className={HEAD_ROW}>
        <span>Title</span>
        <span>Group</span>
        <span>Target</span>
        <span>Size</span>
        <span>Seeders</span>
        <span>Score</span>
        <span>Ownership</span>
        <span>Published</span>
        <span>Action</span>
      </div>

      <VirtualList
        items={data.releases}
        estimateSize={() => 80}
        keyExtractor={(r) => r.id}
        className="h-[600px]"
        renderItem={(r) => {
          const grabDisabled =
            r.ownership === 'in-library' || r.ownership === 'downloading' || pendingId === r.id;
          const grabLabel =
            pendingId === r.id
              ? 'Grabbing…'
              : r.ownership === 'in-library'
                ? 'In library'
                : r.ownership === 'downloading'
                  ? 'Downloading'
                  : 'Grab';
          return (
            <div className={`${BODY_ROW} min-h-[80px] hover:bg-hover`}>
              <span className="flex min-w-0 flex-col gap-0.5">
                {r.link ? (
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={r.title}
                    className="truncate hover:underline"
                  >
                    {r.title}
                  </a>
                ) : (
                  // Manual .torrent uploads / qbt-adopted torrents carry no link.
                  <span className="truncate" title={r.title}>
                    {r.title}
                  </span>
                )}
                {r.indexerKind === 'manual' ? (
                  <span>
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px] uppercase tracking-[0.08em]"
                      title="Added manually (not from an indexer)"
                    >
                      MANUAL
                    </Badge>
                  </span>
                ) : r.indexerName ? (
                  <span
                    className="flex items-center gap-1 text-[11px] text-muted-foreground"
                    title={r.indexerKind ? `${r.indexerName} (${r.indexerKind})` : r.indexerName}
                  >
                    <Server className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate font-mono">{r.indexerName}</span>
                  </span>
                ) : null}
              </span>
              <span className="truncate">{r.groupName ?? '—'}</span>
              <span className="font-mono">{formatTarget(r)}</span>
              <span className="font-mono">{formatSize(r.sizeBytes)}</span>
              <span className="font-mono">{r.seeders}</span>
              <span className="font-mono">{r.score?.toFixed(0) ?? '—'}</span>
              <span>
                {r.ownership === 'in-library' ? (
                  <Badge>In library</Badge>
                ) : r.ownership === 'downloading' ? (
                  <Badge variant="outline">Downloading</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
              <span className="font-mono">{new Date(r.publishedAt).toLocaleDateString()}</span>
              <span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={grabDisabled}
                  onClick={() => grabMutation.mutate(r.id)}
                >
                  {grabLabel}
                </Button>
              </span>
            </div>
          );
        }}
      />
    </div>
  );
}

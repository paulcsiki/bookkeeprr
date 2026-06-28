'use client';

import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-fetch';
import { pushSample, useSpeedHistory } from './hooks/useSpeedHistory';

type ActiveRow = {
  status: string;
  downloadSpeed?: number | null;
  progress?: number | null;
  sizeBytes?: number | null;
  eta?: number | null;
};

type Props = {
  rows: ActiveRow[];
  activeCount: number;
  queuedCount: number;
};

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(2)} GiB`;
}

function fmtSpeed(bytesPerSec: number): string {
  const mib = bytesPerSec / (1024 * 1024);
  if (mib >= 1) return `${mib.toFixed(1)} MiB/s`;
  const kib = bytesPerSec / 1024;
  return `${Math.round(kib)} KiB/s`;
}

function fmtEta(seconds: number): string {
  if (seconds <= 0) return '';
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function Sparkline({ samples }: { samples: readonly { speed: number }[] }): React.JSX.Element {
  const w = 200;
  const h = 40;
  if (samples.length < 2) {
    return <svg width={w} height={h} aria-hidden="true" />;
  }

  const maxSpeed = Math.max(...samples.map((s) => s.speed), 1);
  const step = w / (samples.length - 1);

  const points = samples
    .map((s, i) => {
      const x = i * step;
      const y = h - (s.speed / maxSpeed) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Build a closed path for the fill: sparkline top + bottom baseline
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return <svg width={w} height={h} aria-hidden="true" />;

  const firstY = h - (first.speed / maxSpeed) * (h - 4) - 2;
  const lastY = h - (last.speed / maxSpeed) * (h - 4) - 2;
  const fillPath = `M 0,${firstY.toFixed(1)} ${samples
    .slice(1)
    .map((s, i) => {
      const x = (i + 1) * step;
      const y = h - (s.speed / maxSpeed) * (h - 4) - 2;
      return `L ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ')} L ${((samples.length - 1) * step).toFixed(1)},${lastY.toFixed(1)} L ${((samples.length - 1) * step).toFixed(1)},${h} L 0,${h} Z`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path
        d={fillPath}
        fill="var(--color-primary)"
        fillOpacity={0.15}
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AggregateSpeedStrip({ rows, activeCount, queuedCount }: Props): React.JSX.Element | null {
  const queryClient = useQueryClient();
  const samples = useSpeedHistory();

  // Compute aggregate speed and bytes transferred from the current rows
  const aggregateSpeed = rows
    .filter((r) => r.status === 'downloading')
    .reduce((sum, r) => sum + (r.downloadSpeed ?? 0), 0);

  const bytesTransferred = rows
    .filter((r) => r.status === 'downloading' && r.progress != null && r.sizeBytes != null)
    .reduce((sum, r) => sum + (r.progress ?? 0) * (r.sizeBytes ?? 0), 0);

  const totalBytes = rows
    .filter((r) => r.status === 'downloading' && r.sizeBytes != null)
    .reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);

  // Push sample on every render (driven by the 10s refetch cycle)
  // We push here so the strip drives the history when it's mounted
  if (aggregateSpeed > 0 || bytesTransferred > 0) {
    pushSample(aggregateSpeed, bytesTransferred);
  }

  // ETA: largest individual ETA among active rows (conservative estimate)
  const maxEta = rows
    .filter((r) => r.status === 'downloading' && r.eta != null && (r.eta ?? 0) > 0)
    .reduce((max, r) => Math.max(max, r.eta ?? 0), 0);

  const pauseAllMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/downloads/pause-all', { method: 'POST' });
      if (!r.ok) throw new Error(`pause-all failed: HTTP ${r.status}`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/downloads/history', { method: 'DELETE' });
      if (!r.ok) throw new Error(`clear-history failed: HTTP ${r.status}`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Speed + bytes stats */}
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <p
              className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-0.5"
              style={{ fontSize: '10px', letterSpacing: '0.14em' }}
            >
              Speed
            </p>
            <p className="font-mono text-lg font-medium" style={{ color: 'var(--color-primary)' }}>
              ↓ {fmtSpeed(aggregateSpeed)}
            </p>
          </div>

          {totalBytes > 0 && (
            <div>
              <p
                className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-0.5"
                style={{ fontSize: '10px', letterSpacing: '0.14em' }}
              >
                Progress
              </p>
              <p className="font-mono text-sm text-foreground">
                {fmtBytes(bytesTransferred)} / {fmtBytes(totalBytes)}
              </p>
            </div>
          )}

          {maxEta > 0 && (
            <div>
              <p
                className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-0.5"
                style={{ fontSize: '10px', letterSpacing: '0.14em' }}
              >
                ETA
              </p>
              <p className="font-mono text-sm text-foreground">{fmtEta(maxEta)}</p>
            </div>
          )}

          <div>
            <p
              className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-0.5"
              style={{ fontSize: '10px', letterSpacing: '0.14em' }}
            >
              Queue
            </p>
            <p className="font-mono text-sm text-foreground">
              {activeCount} active · {queuedCount} queued
            </p>
          </div>
        </div>

        {/* Sparkline */}
        {samples.length >= 2 && (
          <div className="flex-shrink-0">
            <Sparkline samples={samples} />
          </div>
        )}
      </div>

      {/* Bulk action buttons */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          disabled={pauseAllMutation.isPending}
          onClick={() => pauseAllMutation.mutate()}
        >
          Pause all
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={clearHistoryMutation.isPending}
          onClick={() => clearHistoryMutation.mutate()}
        >
          Clear history
        </Button>
      </div>
    </Card>
  );
}

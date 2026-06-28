'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { VirtualList } from '@/components/ui/virtual-list';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

type Run = {
  id: number;
  status: 'running' | 'completed' | 'failed';
  windowDays: number | null;
  triggeredAt: string;
  completedAt: string | null;
  releasesTotal: number;
  releasesFlipped: number;
  releasesRescored: number;
  errorMessage: string | null;
  weightsSnapshotJson: string;
  adultFilterSnapshotJson: string;
  seriesId: number | null;
  seriesTitle: string | null;
};

type Row = {
  id: number;
  releaseId: number;
  oldScore: number | null;
  newScore: number | null;
  oldWouldGrab: boolean;
  newWouldGrab: boolean;
  changedKind: 'flipped' | 'rescored';
  adoptedAt: string | null;
  release: {
    id: number;
    title: string;
    seriesId: number | null;
    seriesTitle: string | null;
  } | null;
};

export function ReplayDetail({
  runId,
  initialRun,
}: {
  runId: number;
  initialRun: Run;
}): React.JSX.Element {
  const [tab, setTab] = useState<'flipped' | 'rescored'>('flipped');
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adopting, setAdopting] = useState(false);

  async function load(kind: 'flipped' | 'rescored'): Promise<void> {
    setRows([]);
    setSelected(new Set());
    const r = await apiFetch(
      `/api/settings/matcher/replays/${runId}?kind=${kind}&page=0&pageSize=200`,
    );
    if (!r.ok) {
      toast.error(`Load failed: ${r.status}`);
      return;
    }
    const body = (await r.json()) as { rows: Row[] };
    setRows(body.rows);
    setSelected(new Set());
  }

  useEffect(() => {
    void load(tab);
  }, [tab, runId]);

  function toggle(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function adopt(): Promise<void> {
    if (selected.size === 0) return;
    setAdopting(true);
    try {
      const r = await apiFetch(`/api/settings/matcher/replays/${runId}/adopt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replayIds: Array.from(selected) }),
      });
      if (!r.ok) {
        toast.error(`Adopt failed: ${await r.text()}`);
        return;
      }
      const body = (await r.json()) as { adopted: number; failed: Array<{ error: string }> };
      if (body.failed.length === 0) {
        toast.success(`Adopted ${body.adopted} decision${body.adopted === 1 ? '' : 's'}`);
      } else {
        toast.warning(`Adopted ${body.adopted}, ${body.failed.length} failed`);
      }
      await load(tab);
    } finally {
      setAdopting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-1">
        <div className="text-sm">
          <span className="font-mono">{initialRun.status}</span> —{' '}
          {initialRun.windowDays === null ? 'all retained' : `last ${initialRun.windowDays}d`} —{' '}
          {initialRun.releasesTotal} evaluated
        </div>
        <div className="text-xs text-muted-foreground">
          Triggered {new Date(initialRun.triggeredAt).toLocaleString()}
          {initialRun.completedAt
            ? `, completed ${new Date(initialRun.completedAt).toLocaleString()}`
            : ''}
        </div>
        {initialRun.seriesId !== null ? (
          <div className="text-xs text-muted-foreground">
            Scope:{' '}
            <Link
              href={`/library/${initialRun.seriesId}`}
              className="underline hover:text-foreground"
            >
              {initialRun.seriesTitle ?? `Series #${initialRun.seriesId}`}
            </Link>
          </div>
        ) : null}
        {initialRun.errorMessage ? (
          <div className="text-xs text-destructive">Error: {initialRun.errorMessage}</div>
        ) : null}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            Snapshot weights & filter
          </summary>
          <div className="mt-2 space-y-2">
            <div>
              <div className="text-muted-foreground">Weights</div>
              <pre className="font-mono text-xs whitespace-pre-wrap break-all rounded border border-border bg-muted/30 p-2">
                {formatJson(initialRun.weightsSnapshotJson)}
              </pre>
            </div>
            <div>
              <div className="text-muted-foreground">Adult filter</div>
              <pre className="font-mono text-xs whitespace-pre-wrap break-all rounded border border-border bg-muted/30 p-2">
                {formatJson(initialRun.adultFilterSnapshotJson)}
              </pre>
            </div>
          </div>
        </details>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'flipped' | 'rescored')}>
        <TabsList>
          <TabsTrigger value="flipped">Flipped ({initialRun.releasesFlipped})</TabsTrigger>
          <TabsTrigger value="rescored">Rescored ({initialRun.releasesRescored})</TabsTrigger>
        </TabsList>

        <TabsContent value="flipped" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selected.size} selected of {rows.length}
            </div>
            <Button onClick={adopt} disabled={selected.size === 0 || adopting}>
              Grab {selected.size > 0 ? selected.size : ''} selected
            </Button>
          </div>
          <Card className="p-0 overflow-hidden">
            <VirtualList
              items={rows}
              estimateSize={() => 52}
              keyExtractor={(r) => r.id}
              className="max-h-[60vh]"
              renderItem={(r) => (
                <RowItem row={r} selected={selected.has(r.id)} onToggle={() => toggle(r.id)} />
              )}
            />
          </Card>
        </TabsContent>

        <TabsContent value="rescored">
          <Card className="p-0 overflow-hidden">
            <VirtualList
              items={rows}
              estimateSize={() => 52}
              keyExtractor={(r) => r.id}
              className="max-h-[60vh]"
              renderItem={(r) => <RowItem row={r} selected={false} onToggle={null} />}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RowItem({
  row,
  selected,
  onToggle,
}: {
  row: Row;
  selected: boolean;
  onToggle: (() => void) | null;
}): React.JSX.Element {
  const adoptable =
    row.changedKind === 'flipped' && row.newWouldGrab && !row.oldWouldGrab && !row.adoptedAt;
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3 py-2 border-b border-border last:border-0">
      <div>
        {onToggle && adoptable ? (
          <Checkbox checked={selected} onCheckedChange={onToggle} />
        ) : (
          <div className="w-4" />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate font-mono text-xs">
          {row.release?.title ?? `release #${row.releaseId}`}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {row.release?.seriesTitle ?? '—'}
        </div>
      </div>
      <div className="text-xs font-mono text-muted-foreground">
        {row.oldScore ?? '—'} → {row.newScore ?? '—'}
      </div>
      <div className="text-xs">
        {row.adoptedAt ? (
          <span className="text-[var(--color-ok)]">adopted</span>
        ) : row.changedKind === 'flipped' ? (
          <span className={row.newWouldGrab ? 'text-primary' : 'text-muted-foreground'}>
            {row.newWouldGrab ? 'now grabs' : 'no longer grabs'}
          </span>
        ) : (
          <span className="text-muted-foreground">rescored</span>
        )}
      </div>
    </div>
  );
}

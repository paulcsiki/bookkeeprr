'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';

type RunRow = {
  id: number;
  status: 'running' | 'completed' | 'failed';
  windowDays: number | null;
  triggeredAt: string;
  completedAt: string | null;
  releasesTotal: number;
  releasesFlipped: number;
  releasesRescored: number;
};

type Window = '30' | '90' | '180' | 'all';

const WINDOW_TO_VALUE: Record<Window, number | null> = {
  '30': 30,
  '90': 90,
  '180': 180,
  all: null,
};

export function ReplayCard({
  initialAutoReplay,
}: {
  initialAutoReplay: boolean;
}): React.JSX.Element {
  const [windowSel, setWindowSel] = useState<Window>('90');
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<RunRow | null>(null);
  const [autoReplay, setAutoReplay] = useState<boolean>(initialAutoReplay);
  const [autoReplayBusy, setAutoReplayBusy] = useState(false);

  async function toggleAutoReplay(next: boolean): Promise<void> {
    setAutoReplayBusy(true);
    try {
      const r = await apiFetch('/api/settings/matcher/auto-replay', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!r.ok) {
        toast.error(`Failed to ${next ? 'enable' : 'disable'} auto-replay`);
        return;
      }
      setAutoReplay(next);
      toast.success(next ? 'Auto-replay enabled' : 'Auto-replay disabled');
    } finally {
      setAutoReplayBusy(false);
    }
  }

  async function loadLast(): Promise<void> {
    try {
      const r = await apiFetch('/api/settings/matcher/replays?limit=1');
      if (!r.ok) return;
      const body = (await r.json()) as { runs: RunRow[] };
      setLastRun(body.runs[0] ?? null);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadLast();
  }, []);

  useEffect(() => {
    if (lastRun?.status !== 'running') return;
    const t = setInterval(() => void loadLast(), 5000);
    return () => clearInterval(t);
  }, [lastRun?.status]);

  async function runReplay(): Promise<void> {
    setBusy(true);
    try {
      const r = await apiFetch('/api/settings/matcher/replays', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ windowDays: WINDOW_TO_VALUE[windowSel] }),
      });
      if (r.status === 409) {
        const body = (await r.json()) as { runId: number };
        toast.error(`A replay is already running (run #${body.runId})`);
      } else if (!r.ok) {
        const text = await r.text();
        toast.error(`Replay failed to start: ${text}`);
      } else {
        toast.success('Replay enqueued');
        await loadLast();
      }
    } finally {
      setBusy(false);
    }
  }

  const isRunning = lastRun?.status === 'running';

  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium">Replay matcher</div>
      <p className="text-sm text-muted-foreground">
        Re-run the matcher against historical releases with current scoring weights. Review changed
        decisions and adopt the ones you want to grab.
      </p>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="auto-replay-toggle">Auto-replay on save</Label>
          <p className="text-xs text-muted-foreground">
            Automatically run a 90-day replay after weights or adult-filter changes.
          </p>
        </div>
        <Switch
          id="auto-replay-toggle"
          checked={autoReplay}
          onCheckedChange={(v) => void toggleAutoReplay(Boolean(v))}
          disabled={autoReplayBusy}
        />
      </div>
      <div className="space-y-2">
        <Label>Window</Label>
        <ToggleGroup
          type="single"
          value={windowSel}
          onValueChange={(v) => {
            if (v) setWindowSel(v as Window);
          }}
          variant="outline"
          className="justify-start flex-wrap"
        >
          <ToggleGroupItem value="30">Last 30 days</ToggleGroupItem>
          <ToggleGroupItem value="90">Last 90 days</ToggleGroupItem>
          <ToggleGroupItem value="180">Last 180 days</ToggleGroupItem>
          <ToggleGroupItem value="all">All retained</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Button onClick={runReplay} disabled={busy || isRunning}>
          {isRunning ? 'Replay running…' : 'Run replay'}
        </Button>
        {lastRun ? (
          <Link
            href={`/settings/matcher/replays/${lastRun.id}`}
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Last run: {new Date(lastRun.triggeredAt).toLocaleString()} — {lastRun.releasesFlipped}{' '}
            flipped, {lastRun.releasesRescored} rescored →
          </Link>
        ) : (
          <Link
            href="/settings/matcher/replays"
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            History →
          </Link>
        )}
      </div>
    </Card>
  );
}

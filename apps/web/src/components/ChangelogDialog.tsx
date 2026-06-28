'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { useChangelogSeen } from '@/components/hooks/useChangelogSeen';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type UpdatesPayload = {
  buildInfo: { version: string };
  state: { latestReleaseBody: string | null; latestReleaseUrl: string | null };
  config: { showChangelogOnFirstLaunch: boolean };
};

export function ChangelogDialog(): React.JSX.Element | null {
  const [shouldShow, setShouldShow] = useState(false);
  const [data, setData] = useState<UpdatesPayload | null>(null);
  const { lastSeen, isLoading: seenLoading, markSeen } = useChangelogSeen();

  useEffect(() => {
    if (seenLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/api/updates');
        if (cancelled || !r.ok) return;
        const payload = (await r.json()) as UpdatesPayload;
        setData(payload);
        if (
          payload.config.showChangelogOnFirstLaunch &&
          lastSeen !== null && // not a fresh install
          lastSeen !== payload.buildInfo.version
        ) {
          setShouldShow(true);
        }
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seenLoading, lastSeen]);

  async function dismiss(): Promise<void> {
    if (data !== null) {
      markSeen(data.buildInfo.version);
    }
    setShouldShow(false);
  }

  if (!shouldShow || !data) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && void dismiss()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            Update installed
          </div>
          <DialogTitle>What&apos;s new — v{data.buildInfo.version}</DialogTitle>
          <DialogDescription>
            You upgraded from <code className="font-mono">v{lastSeen ?? '?'}</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto">
          {data.state.latestReleaseBody ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
              {data.state.latestReleaseBody}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Welcome to v{data.buildInfo.version} — changelog will load shortly.
            </p>
          )}
        </div>
        <DialogFooter>
          {data.state.latestReleaseUrl ? (
            <Link
              href={data.state.latestReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Read on GitHub →
            </Link>
          ) : null}
          <Button onClick={dismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

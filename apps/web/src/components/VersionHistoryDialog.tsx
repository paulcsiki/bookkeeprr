'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type GhRelease = {
  tagName: string;
  name: string | null;
  body: string | null;
  htmlUrl: string;
  publishedAt: string | null;
  prerelease: boolean;
};

export function VersionHistoryDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const [releases, setReleases] = useState<GhRelease[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/api/updates/releases');
        if (cancelled) return;
        if (!r.ok) {
          setError(`Couldn't reach GitHub (${r.status})`);
          setReleases([]);
          return;
        }
        const body = (await r.json()) as { releases: GhRelease[] };
        setReleases(body.releases);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setReleases([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Hosted at <span className="font-mono">github.com/paulcsiki/bookkeeprr/releases</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          {releases?.map((r) => (
            <div key={r.tagName} className="border border-border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm">{r.tagName}</div>
                <div className="text-xs text-muted-foreground">
                  {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : 'unknown'}
                </div>
              </div>
              {r.body ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
                  {r.body}
                </pre>
              ) : null}
              <Link
                href={r.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                Read on GitHub →
              </Link>
            </div>
          ))}
          {releases && releases.length === 0 && !error ? (
            <div className="text-sm text-muted-foreground">No releases found.</div>
          ) : null}
        </div>
        <DialogFooter>
          <Button asChild variant="outline">
            <Link href="/settings/updates" onClick={onClose}>
              Update settings
            </Link>
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

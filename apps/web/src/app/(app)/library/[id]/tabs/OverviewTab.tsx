'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cleanDescription, fmtRuntime } from '@/lib/format';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import type { SeriesRow } from '@/server/db/schema';

type Props = { series: SeriesRow; isAdmin?: boolean };

export function OverviewTab({ series, isAdmin = false }: Props): React.JSX.Element {
  const description = cleanDescription(series.description);
  return (
    <div className="space-y-4 mt-4">
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
          {description}
        </p>
      ) : (
        <p className="text-muted-foreground">No description.</p>
      )}
      <div className="grid grid-cols-2 gap-4 text-sm">
        {series.contentType === 'ebook' ? (
          <div className="min-w-0">
            <div className="text-muted-foreground">Pages</div>
            <div className="font-mono">{series.pageCount ?? '—'}</div>
          </div>
        ) : series.contentType === 'audiobook' ? (
          <div className="min-w-0">
            <div className="text-muted-foreground">Runtime</div>
            <div className="font-mono">{fmtRuntime(series.runtimeMinutes)}</div>
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <div className="text-muted-foreground">Total volumes</div>
              <div>{series.totalVolumes ?? '—'}</div>
              {series.totalVolumes == null && series.granularity === 'volume' ? (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Volumes appear after you grab and import a release.
                </div>
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="text-muted-foreground">Total chapters</div>
              <div>{series.totalChapters ?? '—'}</div>
            </div>
          </>
        )}
        <div className="min-w-0">
          <div className="text-muted-foreground">Root path</div>
          <div className="truncate font-mono text-xs">{series.rootPath}</div>
        </div>
        <div className="min-w-0">
          {series.contentType === 'ebook' ? (
            <>
              <div className="text-muted-foreground">ISBN</div>
              <div className="font-mono text-xs">{series.isbn ?? '—'}</div>
            </>
          ) : series.contentType === 'audiobook' ? (
            <>
              <div className="text-muted-foreground">ASIN</div>
              <div className="font-mono text-xs">{series.asin ?? '—'}</div>
            </>
          ) : series.contentType === 'comic' ? (
            <>
              <div className="text-muted-foreground">ComicVine ID</div>
              <div className="font-mono text-xs">{series.comicvineId ?? '—'}</div>
            </>
          ) : (
            <>
              <div className="text-muted-foreground">AniList ID</div>
              <div className="font-mono text-xs">{series.anilistId ?? '—'}</div>
            </>
          )}
        </div>
      </div>
      {isAdmin ? (
        <div className="flex flex-wrap gap-2 pt-2">
          <RefreshMetadataButton seriesId={series.id} />
          <PerSeriesReplayButton seriesId={series.id} />
        </div>
      ) : null}
    </div>
  );
}

function RefreshMetadataButton({ seriesId }: { seriesId: number }): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  async function run(): Promise<void> {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/series/${seriesId}/refresh-metadata`, { method: 'POST' });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        toast.error(body.error ?? body.message ?? `Refresh failed: HTTP ${r.status}`);
        return;
      }
      toast.success('Metadata refresh queued — covers and details update shortly');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={busy}>
      {busy ? 'Queuing…' : 'Refresh metadata'}
    </Button>
  );
}

function PerSeriesReplayButton({ seriesId }: { seriesId: number }): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  async function run(): Promise<void> {
    setBusy(true);
    try {
      const r = await apiFetch('/api/settings/matcher/replays', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ windowDays: 90, seriesId }),
      });
      if (r.status === 409) {
        const body = (await r.json()) as { runId: number };
        toast.error(`A replay is already running (run #${body.runId})`);
      } else if (!r.ok) {
        toast.error(`Replay failed to start: ${await r.text()}`);
      } else {
        const body = (await r.json()) as { runId: number };
        toast.success(
          <span>
            Replay started —{' '}
            <Link href={`/settings/matcher/replays/${body.runId}`} className="underline">
              view results →
            </Link>
          </span>,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={busy}>
      Replay matcher for this series
    </Button>
  );
}

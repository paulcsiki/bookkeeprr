import Link from 'next/link';
import { listReplayRuns } from '@/server/db/replay-runs';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ReplaysHistoryPage(): Promise<React.JSX.Element> {
  const runs = await listReplayRuns(50);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display">Replay history</h1>
        <Link
          href="/settings/matcher"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to matcher settings
        </Link>
      </div>
      <Card className="divide-y divide-border">
        {runs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No replays yet.</div>
        ) : (
          runs.map((r) => (
            <Link
              key={r.id}
              href={`/settings/matcher/replays/${r.id}`}
              className="block p-4 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-sm">
                  Run #{r.id} — {r.windowDays === null ? 'all retained' : `last ${r.windowDays}d`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.triggeredAt).toLocaleString()}
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                <span className="font-mono">{r.status}</span> — {r.releasesTotal} evaluated,{' '}
                <span className="font-mono">{r.releasesFlipped}</span> flipped,{' '}
                <span className="font-mono">{r.releasesRescored}</span> rescored
                {r.errorMessage ? (
                  <span className="ml-2 text-destructive">— {r.errorMessage}</span>
                ) : null}
              </div>
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}

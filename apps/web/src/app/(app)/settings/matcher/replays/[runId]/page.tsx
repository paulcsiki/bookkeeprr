import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getReplayRun } from '@/server/db/replay-runs';
import { getSeries } from '@/server/db/series';
import { ReplayDetail } from './ReplayDetail';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ runId: string }> };

export default async function ReplayDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { runId: runIdRaw } = await params;
  const runId = Number(runIdRaw);
  if (!Number.isInteger(runId) || runId <= 0) notFound();
  const run = await getReplayRun(runId);
  if (!run) notFound();

  let seriesTitle: string | null = null;
  if (run.seriesId !== null) {
    const s = await getSeries(run.seriesId);
    seriesTitle = s
      ? (s.titleEnglish ?? s.titleRomaji ?? s.titleNative ?? `Series #${s.id}`)
      : null;
  }

  const initialRun = {
    ...JSON.parse(JSON.stringify(run)),
    seriesId: run.seriesId,
    seriesTitle,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display">Replay run #{run.id}</h1>
        <Link
          href="/settings/matcher/replays"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← History
        </Link>
      </div>
      <ReplayDetail runId={run.id} initialRun={initialRun} />
    </div>
  );
}

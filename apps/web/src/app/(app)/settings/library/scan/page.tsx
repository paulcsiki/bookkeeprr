import { PageHeader } from '@/components/shell/PageHeader';
import { ScanForm } from './ScanForm';
import { ScanProgress } from './ScanProgress';
import { GroupCard } from './GroupCard';
import { buildGroupSummaries } from '@/server/scan-groups';

export const dynamic = 'force-dynamic';

export default async function ScanPage(): Promise<React.JSX.Element> {
  const groups = await buildGroupSummaries();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Library scan"
        subtitle="Point bookkeeprr at a directory on disk. We'll match each subfolder against AniList and let you confirm or change matches before importing."
      />
      <ScanForm />
      <ScanProgress />
      <section className="space-y-3">
        <h3 className="font-display text-lg font-semibold tracking-[-0.015em]">
          Pending matches ({groups.length})
        </h3>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pending matches. Run a scan above to find existing manga in your library.
          </p>
        ) : (
          groups.map((g) => <GroupCard key={g.dirHash} group={g} />)
        )}
      </section>
    </div>
  );
}

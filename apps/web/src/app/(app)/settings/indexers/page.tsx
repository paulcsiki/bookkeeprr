import { PageHeader } from '@/components/shell/PageHeader';
import { listIndexers } from '@/server/db/indexers';
import { prowlarrConnectionSetting } from '@/server/db/settings/prowlarr';
import { IndexersList } from './IndexersList';

export const dynamic = 'force-dynamic';

export default async function IndexersPage(): Promise<React.JSX.Element> {
  const [indexers, prowlarr] = await Promise.all([
    listIndexers(),
    prowlarrConnectionSetting.get(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Indexers"
        subtitle="Configure release indexers. Disabled indexers are skipped by RSS poll and Interactive Search."
      />
      <IndexersList
        prowlarrUrl={prowlarr.url}
        prowlarrHasKey={prowlarr.apiKey.length > 0}
        initial={indexers.map((i) => ({
          id: i.id,
          kind: i.kind,
          name: i.name,
          baseUrl: i.baseUrl,
          enabled: i.enabled,
          configJson: i.configJson,
          lastRssAt: i.lastRssAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}

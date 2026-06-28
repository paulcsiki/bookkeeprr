import { PageHeader } from '@/components/shell/PageHeader';
import { discoverTrendingSourceSetting } from '@/server/db/settings/discover';
import { malClientIdSetting, isMalConfigured } from '@/server/db/settings/mal';
import { DiscoverConfigForm } from './DiscoverConfigForm';

export const dynamic = 'force-dynamic';

export default async function DiscoverSettingsPage(): Promise<React.JSX.Element> {
  const [trendingSource, malConfigured] = await Promise.all([
    discoverTrendingSourceSetting.get(),
    malClientIdSetting.get().then(isMalConfigured),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Discover"
        subtitle={<>Choose where the Discover &ldquo;Trending now&rdquo; rail gets its titles.</>}
      />
      <DiscoverConfigForm initialTrendingSource={trendingSource} malConfigured={malConfigured} />
    </div>
  );
}

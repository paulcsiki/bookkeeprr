import { PageHeader } from '@/components/shell/PageHeader';
import { malClientIdSetting } from '@/server/db/settings/mal';
import { MalConfigForm } from './MalConfigForm';

export const dynamic = 'force-dynamic';

export default async function MalSettingsPage(): Promise<React.JSX.Element> {
  const clientId = await malClientIdSetting.get();
  return (
    <div className="space-y-6">
      <PageHeader
        title="MyAnimeList"
        subtitle={
          <>
            Configure your MyAnimeList API Client ID. Required for searching manga via the MAL
            source.
          </>
        }
      />
      <MalConfigForm initialClientId={clientId.length > 0 ? '****' : ''} />
    </div>
  );
}

import { PageHeader } from '@/components/shell/PageHeader';
import { nytApiKeySetting } from '@/server/db/settings/nyt';
import { NytConfigForm } from './NytConfigForm';

export const dynamic = 'force-dynamic';

export default async function NytSettingsPage(): Promise<React.JSX.Element> {
  const apiKey = await nytApiKeySetting.get();
  return (
    <div className="space-y-6">
      <PageHeader
        title="New York Times"
        subtitle={
          <>
            Configure your New York Times Books API key. Used to source audiobook bestsellers in
            Discover.
          </>
        }
      />
      <NytConfigForm initialApiKey={apiKey.length > 0 ? '****' : ''} />
    </div>
  );
}

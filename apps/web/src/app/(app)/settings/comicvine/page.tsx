import { PageHeader } from '@/components/shell/PageHeader';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import { ComicVineForm } from './ComicVineForm';

export const dynamic = 'force-dynamic';

export default async function ComicVineSettingsPage(): Promise<React.JSX.Element> {
  const apiKey = await comicVineApiKeySetting.get();
  return (
    <div className="space-y-6">
      <PageHeader
        title="ComicVine"
        subtitle={
          <>
            Configure your ComicVine API key. Required for searching and hydrating comic series. Get
            a free key at{' '}
            <a
              href="https://comicvine.gamespot.com/api/"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              comicvine.gamespot.com/api
            </a>
            .
          </>
        }
      />
      <ComicVineForm initialApiKey={apiKey.length > 0 ? '****' : ''} />
    </div>
  );
}

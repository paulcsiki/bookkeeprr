import { PageHeader } from '@/components/shell/PageHeader';
import { searchProvidersSetting } from '@/server/db/settings/search-providers';
import { SearchProvidersForm } from './SearchProvidersForm';

export const dynamic = 'force-dynamic';

export default async function SearchProvidersSettingsPage(): Promise<React.JSX.Element> {
  const providers = await searchProvidersSetting.get();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Search providers"
        subtitle={
          <>
            Choose which sources discovery searches. Search AniList, MangaDex, ComicVine, OpenLibrary,
            Audnex or NovelUpdates — toggle any of them off to skip it.
          </>
        }
      />
      <SearchProvidersForm initial={providers} />
    </div>
  );
}

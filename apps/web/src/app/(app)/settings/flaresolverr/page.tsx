import { PageHeader } from '@/components/shell/PageHeader';
import { flaresolverrSetting } from '@/server/db/settings/flaresolverr';
import { FlaresolverrForm } from './FlaresolverrForm';

export const dynamic = 'force-dynamic';

export default async function FlaresolverrSettingsPage(): Promise<React.JSX.Element> {
  const cfg = await flaresolverrSetting.get();
  return (
    <div className="space-y-6">
      <PageHeader
        title="FlareSolverr"
        subtitle={
          <>
            Route NovelUpdates requests through a FlareSolverr proxy to bypass Cloudflare. Leave
            blank to fetch directly.
          </>
        }
      />
      <FlaresolverrForm initialUrl={cfg.url} />
    </div>
  );
}

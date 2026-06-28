import { redirect } from 'next/navigation';
import { firstRunCompleteSetting } from '@/server/db/settings/first-run';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { countUsers } from '@/server/db/users';
import { resolveFirstRunPaths } from '@/server/first-run/paths';
import { OnboardingStage } from './OnboardingStage';

export const dynamic = 'force-dynamic';

export default async function FirstRunPage(): Promise<React.JSX.Element> {
  if (await firstRunCompleteSetting.get()) redirect('/library');

  const userCount = await countUsers();
  const qbt = await qbtConnectionSetting.get();
  const paths = await resolveFirstRunPaths();

  return (
    <OnboardingStage
      adminExists={userCount > 0}
      paths={paths}
      qbtInitial={{
        host: qbt.host,
        port: qbt.port,
        username: qbt.username,
        password: qbt.password.length > 0 ? '****' : '',
        useHttps: qbt.useHttps,
      }}
    />
  );
}

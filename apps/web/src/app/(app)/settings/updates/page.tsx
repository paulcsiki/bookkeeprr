import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { getBuildInfo } from '@/server/build-info';
import { updatesConfigSetting, updatesStateSetting } from '@/server/db/settings/updates';
import {
  deploymentModeOverrideSetting,
  type DeploymentModeOverride,
} from '@/server/db/settings/deployment';
import { detectDeploymentMode, getEffectiveDeploymentMode } from '@/server/deployment/mode';
import { PageHeader } from '@/components/shell/PageHeader';
import { UpdatesForm } from './UpdatesForm';

export const dynamic = 'force-dynamic';

export default async function UpdatesPage(): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (!actor || actor.role !== 'admin') redirect('/');

  const [config, state, override, effectiveMode] = await Promise.all([
    updatesConfigSetting.get(),
    updatesStateSetting.get(),
    deploymentModeOverrideSetting.get(),
    getEffectiveDeploymentMode(),
  ]);
  const detected = detectDeploymentMode();
  const buildInfo = getBuildInfo();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Updates"
        subtitle="GitHub release polling, version pill, and changelog dialog. Bookkeeprr never self-installs in any mode — when an update is available, the right command for your deployment mode is shown so you can run it yourself."
      />
      <UpdatesForm
        initial={{
          config,
          state,
          override: override as DeploymentModeOverride,
          detected,
          effectiveMode,
          buildInfo,
        }}
      />
    </div>
  );
}

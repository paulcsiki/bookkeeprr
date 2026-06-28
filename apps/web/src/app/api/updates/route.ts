import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { getBuildInfo } from '@/server/build-info';
import {
  updatesConfigSetting,
  updatesStateSetting,
  lastSeenChangelogVersionSetting,
} from '@/server/db/settings/updates';
import { getEffectiveDeploymentMode } from '@/server/deployment/mode';
import { compareSemver } from '@/server/util/semver';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const [config, state, lastSeen, deploymentMode] = await Promise.all([
    updatesConfigSetting.get(),
    updatesStateSetting.get(),
    lastSeenChangelogVersionSetting.get(),
    getEffectiveDeploymentMode(),
  ]);
  const buildInfo = getBuildInfo();
  const updateAvailable =
    state.latestVersion !== null &&
    compareSemver(state.latestVersion, `v${buildInfo.version}`) > 0;
  return NextResponse.json({
    buildInfo,
    state,
    config,
    deploymentMode,
    updateAvailable,
    lastSeenVersion: lastSeen.version,
  });
}

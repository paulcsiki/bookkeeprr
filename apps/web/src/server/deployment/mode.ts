import { existsSync } from 'node:fs';
import { deploymentModeOverrideSetting } from '@/server/db/settings/deployment';

// 'standalone' = not running inside a recognized container orchestrator
// (bare-metal, local/dev, or a plain process).
export type DeploymentMode = 'docker' | 'kubernetes' | 'standalone';

export function detectDeploymentMode(): DeploymentMode {
  if (process.env.KUBERNETES_SERVICE_HOST) return 'kubernetes';
  if (existsSync('/.dockerenv')) return 'docker';
  return 'standalone';
}

export async function getEffectiveDeploymentMode(): Promise<DeploymentMode> {
  const { mode } = await deploymentModeOverrideSetting.get();
  // Only the real, forceable targets override detection; 'auto' (and any legacy
  // override value) falls through to detection.
  if (mode === 'docker' || mode === 'kubernetes') return mode;
  return detectDeploymentMode();
}

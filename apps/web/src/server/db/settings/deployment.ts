import { z } from 'zod';
import { defineSetting } from '../settings';

export const DeploymentModeOverrideSchema = z
  .object({
    mode: z.enum(['auto', 'docker', 'kubernetes', 'unknown']),
  })
  .strict();

export type DeploymentModeOverride = z.infer<typeof DeploymentModeOverrideSchema>;

export const deploymentModeOverrideSetting = defineSetting(
  'deployment.mode_override',
  DeploymentModeOverrideSchema,
  { mode: 'auto' },
);

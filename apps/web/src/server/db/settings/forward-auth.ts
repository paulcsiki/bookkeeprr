import type { z } from 'zod';
import { ForwardAuthConfigSchema } from '@/server/openapi/schemas/auth';
import { defineSetting } from '../settings';

// Single-sourced in the OpenAPI schema module (also the
// GET/PATCH /api/auth/forward-auth/config view).
export { ForwardAuthConfigSchema };

export type ForwardAuthConfig = z.infer<typeof ForwardAuthConfigSchema>;

const DEFAULT: ForwardAuthConfig = {
  enabled: false,
  trustedProxies: [],
  userHeader: 'Remote-User',
  emailHeader: 'Remote-Email',
  groupsHeader: 'Remote-Groups',
  autoCreateUsers: true,
  allowedGroups: [],
  adminGroups: [],
};

export const forwardAuthConfigSetting = defineSetting(
  'forward-auth-config',
  ForwardAuthConfigSchema,
  DEFAULT,
);

export function isForwardAuthConfigured(cfg: ForwardAuthConfig): boolean {
  return cfg.enabled && cfg.trustedProxies.length > 0 && cfg.userHeader.length > 0;
}

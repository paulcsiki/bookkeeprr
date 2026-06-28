import type { z } from 'zod';
import { OidcConfigSchema } from '@/server/openapi/schemas/auth';
import { defineSetting } from '../settings';

// Single-sourced in the OpenAPI schema module (also the
// GET/PATCH /api/auth/oidc/config view).
export { OidcConfigSchema };

export type OidcConfig = z.infer<typeof OidcConfigSchema>;

const DEFAULT: OidcConfig = {
  enabled: false,
  issuer: '',
  clientId: '',
  clientSecret: '',
  scopes: ['openid', 'profile', 'email', 'groups'],
  buttonLabel: 'Sign in with SSO',
  usernameClaim: 'preferred_username',
  emailClaim: 'email',
  groupsClaim: 'groups',
  allowedGroups: [],
  adminGroups: [],
  autoCreateUsers: true,
};

export const oidcConfigSetting = defineSetting('oidc-config', OidcConfigSchema, DEFAULT);

export function isOidcConfigured(cfg: OidcConfig): boolean {
  return (
    cfg.enabled && cfg.issuer.length > 0 && cfg.clientId.length > 0 && cfg.clientSecret.length > 0
  );
}

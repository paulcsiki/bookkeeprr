import type * as oidc from 'openid-client';
import { oidcConfigSetting, isOidcConfigured, type OidcConfig } from '@/server/db/settings/oidc';
import { getDiscovery } from './discovery';

export async function loadOidcConfig(): Promise<OidcConfig | null> {
  const cfg = await oidcConfigSetting.get();
  return isOidcConfigured(cfg) ? cfg : null;
}

export async function loadDiscoveredConfig(cfg: OidcConfig): Promise<oidc.Configuration> {
  return getDiscovery(cfg.issuer, cfg.clientId, cfg.clientSecret);
}

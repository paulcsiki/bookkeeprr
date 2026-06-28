import { cloudSettings } from '@/server/db/settings/cloud';
import { CloudClient } from './client';

const MARGIN_MS = 60 * 60 * 1000; // refresh if < 1h remaining

function configDir(): string {
  return process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config';
}

export async function ensureAccessToken(): Promise<string | null> {
  const cfg = await cloudSettings.get();
  if (!cfg.enabled || !cfg.tenantId) return null;
  if (
    cfg.accessToken &&
    cfg.accessTokenExpiresAt &&
    new Date(cfg.accessTokenExpiresAt).getTime() - Date.now() > MARGIN_MS
  ) {
    return cfg.accessToken;
  }
  const client = new CloudClient(cfg.cloudBaseUrl, configDir());
  const fqdn = process.env.BOOKKEEPRR_PUBLIC_FQDN ?? 'bookkeeprr.local';
  const res = await client.exchange({ fqdn, installUuid: cfg.installUuid });
  await cloudSettings.set({
    accessToken: res.accessToken,
    accessTokenExpiresAt: res.expiresAt,
    lastRegisterError: null,
  });
  return res.accessToken;
}

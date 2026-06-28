import type { Configuration } from 'openid-client';
import { allowInsecureRequests } from 'openid-client';
import * as oidc from './openid-client';

const DISCOVERY_TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheEntry = { config: Configuration; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function shouldAllowInsecure(): boolean {
  // Opt-in for E2E + dev environments where the IdP runs on http://.
  // Production deployments rely on the openid-client default that rejects HTTP.
  return process.env.BOOKKEEPRR_OIDC_ALLOW_INSECURE === '1';
}

export async function getDiscovery(
  issuer: string,
  clientId: string,
  clientSecret: string,
): Promise<Configuration> {
  const key = `${issuer}|${clientId}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.config;
  const opts = shouldAllowInsecure() ? { execute: [allowInsecureRequests] } : undefined;
  const config = await oidc.discovery(new URL(issuer), clientId, clientSecret, undefined, opts);
  cache.set(key, { config, expiresAt: Date.now() + DISCOVERY_TTL_MS });
  return config;
}

export function __resetDiscoveryCacheForTests(): void {
  cache.clear();
}

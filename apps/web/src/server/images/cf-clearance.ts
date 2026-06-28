import { flaresolverrSetting, isFlaresolverrConfigured } from '@/server/db/settings/flaresolverr';
import { getCfClearance } from '@/server/integrations/flaresolverr/client';

/**
 * In-memory, per-host cache of Cloudflare clearance obtained via FlareSolverr.
 *
 * Solving a host through FlareSolverr/Byparr is slow (it spins up a headless
 * browser and waits out the "Just a moment" challenge), so we solve a host once
 * per TTL window and reuse the resulting `cf_clearance` cookie + User-Agent for
 * every image fetched from that host until it expires.
 *
 * The clearance is bound to the User-Agent that obtained it and to the egress
 * IP, so every direct fetch using it MUST send the cached `userAgent` and run
 * from the same network as FlareSolverr.
 */

type Clearance = { cookie: string; userAgent: string };
type CacheEntry = Clearance & { expiresAt: number };

const TTL_MS = 20 * 60 * 1000; // 20 minutes

const cache = new Map<string, CacheEntry>();

/** Drop a host's cached clearance (e.g. after a 403 reveals it went stale). */
export function invalidateClearance(host: string): void {
  cache.delete(host);
}

/** Test-only: clear the entire clearance cache. */
export function _resetClearanceCache(): void {
  cache.clear();
}

/**
 * Return a usable clearance for `host`, solving it through FlareSolverr at most
 * once per TTL window. Returns null when FlareSolverr is not configured or the
 * solve produced no `cf_clearance` cookie.
 */
export async function clearanceForHost(host: string): Promise<Clearance | null> {
  const cached = cache.get(host);
  if (cached && cached.expiresAt > Date.now()) {
    return { cookie: cached.cookie, userAgent: cached.userAgent };
  }

  const cfg = await flaresolverrSetting.get();
  if (!isFlaresolverrConfigured(cfg)) return null;

  let clearance: Clearance | null;
  try {
    clearance = await getCfClearance(cfg.url, `https://${host}/`);
  } catch {
    // FlareSolverr-level failure (down, challenge unsolved). Caller falls back.
    return null;
  }
  if (!clearance) return null;

  cache.set(host, { ...clearance, expiresAt: Date.now() + TTL_MS });
  return clearance;
}

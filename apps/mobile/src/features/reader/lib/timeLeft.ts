import { OFFLINE_TTL_MS } from './offline-download';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Human "time left" before the 30-day TTL sweep removes a download. Shows only
 * the largest fitting unit: >= 1 day → "Nd left"; else >= 1 hour → "Nh left";
 * else "Nm left" (e.g. 90 min → "1h left"). Floors to "expiring soon" when under
 * one minute remains (or already past). `now` is injected (no Date.now() here).
 */
export function timeLeft(downloadedAt: number, now: number): string {
  const remaining = downloadedAt + OFFLINE_TTL_MS - now;
  if (remaining < 60 * 1000) return 'expiring soon';
  if (remaining >= DAY_MS) return `${Math.floor(remaining / DAY_MS)}d left`;
  if (remaining >= HOUR_MS) return `${Math.floor(remaining / HOUR_MS)}h left`;
  return `${Math.floor(remaining / (60 * 1000))}m left`;
}

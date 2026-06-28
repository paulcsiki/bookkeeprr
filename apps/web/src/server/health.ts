import { z } from 'zod';
import { defineSetting } from './db/settings';

export const WORKER_HEARTBEAT_STALE_MS = 3 * 60_000;

export const heartbeatSetting = defineSetting('worker.last_heartbeat', z.number().int(), 0);

export type HealthResult = {
  status: 'healthy' | 'unhealthy';
  worker: { heartbeatAgeMs: number | null };
  timestamp: number;
};

export async function computeHealth(now: number = Date.now()): Promise<HealthResult> {
  const last = await heartbeatSetting.get();
  if (last === 0) {
    return { status: 'unhealthy', worker: { heartbeatAgeMs: null }, timestamp: now };
  }
  const ageMs = now - last;
  const status = ageMs <= WORKER_HEARTBEAT_STALE_MS ? 'healthy' : 'unhealthy';
  return { status, worker: { heartbeatAgeMs: ageMs }, timestamp: now };
}

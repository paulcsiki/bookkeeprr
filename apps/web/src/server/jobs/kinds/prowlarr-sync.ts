import { z } from 'zod';
import { syncProwlarr, type ProwlarrSyncResult } from '@/server/indexers/prowlarr-sync';
import { prowlarrConnectionSetting, isProwlarrConfigured } from '@/server/db/settings/prowlarr';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({}).passthrough();

export const prowlarrSyncDescriptor: JobKindDescriptor<Record<string, never>, ProwlarrSyncResult | null> = {
  kind: 'prowlarr_sync',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 3,
  handler: async (raw) => {
    Payload.parse(raw);
    const conn = await prowlarrConnectionSetting.get();
    if (!isProwlarrConfigured(conn)) return null;
    try {
      return await syncProwlarr();
    } catch (err) {
      logger().child({ component: 'prowlarr_sync' }).warn({ err: (err as Error).message }, 'scheduled prowlarr sync failed');
      return null;
    }
  },
};

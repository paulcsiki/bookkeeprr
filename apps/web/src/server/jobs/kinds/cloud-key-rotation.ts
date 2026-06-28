import { z } from 'zod';
import type { JobKindDescriptor } from '@/server/jobs/types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '@/server/jobs/types';
import { logger } from '@/server/logger';
import { rotateKey, type RotateKeyResult } from '@/server/cloud/rotation';

const Payload = z.object({}).strict();

export type CloudKeyRotationResult = RotateKeyResult;

export const cloudKeyRotationDescriptor: JobKindDescriptor<
  Record<string, never>,
  CloudKeyRotationResult
> = {
  kind: 'cloud_key_rotation',
  // Don't auto-retry: rotation is best-effort and the next cron tick will
  // pick it up next month. Repeated automatic retries within a single tick
  // can mask issues by burning through `.prev` slots on partial failures.
  retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 1 },
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (raw) => {
    const log = logger().child({ component: 'job-cloud-key-rotation' });
    Payload.parse(raw);
    const result = await rotateKey();
    log.info({ result }, 'cloud key rotation result');
    return result;
  },
};

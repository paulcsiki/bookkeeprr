import { z } from 'zod';
import { defineSetting } from '../settings';

export const ReleaseRetentionSchema = z.object({
  keepPerSeries: z.number().int().min(0).max(10000),
  olderThanDays: z.number().int().min(1).max(3650),
});

export type ReleaseRetention = z.infer<typeof ReleaseRetentionSchema>;

export const releaseRetentionSetting = defineSetting(
  'housekeeping.release_retention',
  ReleaseRetentionSchema,
  { keepPerSeries: 30, olderThanDays: 90 },
);

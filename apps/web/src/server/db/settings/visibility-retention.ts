import { z } from 'zod';
import { defineSetting } from '../settings';

export const VisibilityRetentionSchema = z.object({
  auditRetentionDays: z.number().int().min(1).max(3650),
  logRetentionDays: z.number().int().min(1).max(365),
});

export type VisibilityRetention = z.infer<typeof VisibilityRetentionSchema>;

export const visibilityRetentionSetting = defineSetting(
  'housekeeping.visibility_retention',
  VisibilityRetentionSchema,
  { auditRetentionDays: 30, logRetentionDays: 7 },
);

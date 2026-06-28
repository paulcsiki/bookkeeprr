import { z } from 'zod';
import { defineSetting } from '../settings';

const JobRetentionSchema = z.object({
  terminalDays: z.number().int().min(1).max(3650),
  errorDays: z.number().int().min(1).max(3650),
});

const BackupRetentionSchema = z.object({
  daily: z.number().int().min(0).max(365),
  monthlyDay1: z.number().int().min(0).max(365),
});

export type JobRetention = z.infer<typeof JobRetentionSchema>;
export type BackupRetention = z.infer<typeof BackupRetentionSchema>;

export const jobRetentionSetting = defineSetting(
  'housekeeping.job_retention_days',
  JobRetentionSchema,
  { terminalDays: 30, errorDays: 90 },
);

export const backupRetentionSetting = defineSetting(
  'housekeeping.backup_retention',
  BackupRetentionSchema,
  { daily: 14, monthlyDay1: 12 },
);

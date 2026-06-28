import { z } from 'zod';
import { USER_SOURCES } from '@bookkeeprr/types';

export const AuthModeKind = z.enum(USER_SOURCES);
export type AuthModeKind = z.infer<typeof AuthModeKind>;

export const AuthModeSummary = z.object({
  kind: AuthModeKind,
  enabled: z.boolean(),
  summary: z.string(),
});
export type AuthModeSummary = z.infer<typeof AuthModeSummary>;

export const AuthConfigResponse = z.object({
  modes: z.array(AuthModeSummary),
});
export type AuthConfigResponse = z.infer<typeof AuthConfigResponse>;

import { z } from 'zod';

export const ForwardAuthConfig = z.object({
  enabled: z.boolean(),
  trustedProxies: z.array(z.string()),
  userHeader: z.string(),
  emailHeader: z.string(),
  groupsHeader: z.string(),
  autoCreateUsers: z.boolean(),
  allowedGroups: z.array(z.string()),
  adminGroups: z.array(z.string()),
});
export type ForwardAuthConfig = z.infer<typeof ForwardAuthConfig>;

export const ForwardAuthConfigResponse = z.object({ config: ForwardAuthConfig });
export type ForwardAuthConfigResponse = z.infer<typeof ForwardAuthConfigResponse>;

export const ForwardAuthValidateResult = z.object({
  ready: z.boolean(),
  peerIp: z.string().nullable(),
  clientIp: z.string().nullable(),
  peerInTrustedProxies: z.boolean(),
  userHeaderName: z.string(),
  userHeaderPresent: z.boolean(),
  userHeaderValue: z.string().nullable(),
});
export type ForwardAuthValidateResult = z.infer<typeof ForwardAuthValidateResult>;

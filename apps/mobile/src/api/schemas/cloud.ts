import { z } from 'zod';

export const CloudSettings = z.object({
  enabled: z.boolean(),
  cloudBaseUrl: z.string(),
  tenantId: z.string().nullable(),
  installUuid: z.string(),
  acceptedEulaVersion: z.string().nullable(),
  acceptedPrivacyVersion: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  lastRegisterError: z.string().nullable(),
});
export type CloudSettings = z.infer<typeof CloudSettings>;

export const CloudSettingsResponse = z.object({ config: CloudSettings });
export type CloudSettingsResponse = z.infer<typeof CloudSettingsResponse>;

export const CloudDisconnectResponse = z.object({ devicesRemoved: z.number(), config: CloudSettings });
export type CloudDisconnectResponse = z.infer<typeof CloudDisconnectResponse>;

export const CloudTerms = z.object({
  eulaVersion: z.string(),
  eulaUrl: z.string(),
  privacyVersion: z.string(),
  privacyUrl: z.string(),
  effectiveAt: z.string(),
});
export type CloudTerms = z.infer<typeof CloudTerms>;

export const CloudTermsResponse = z.object({ terms: CloudTerms });
export type CloudTermsResponse = z.infer<typeof CloudTermsResponse>;

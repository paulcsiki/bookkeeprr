import { z } from 'zod';

/** Server returns the stored secret masked with eight U+2022 bullets. Echo it
 * back unchanged on PATCH to keep the existing secret. */
export const OIDC_SECRET_SENTINEL = '••••••••';

export const OidcConfig = z.object({
  enabled: z.boolean(),
  issuer: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  scopes: z.array(z.string()),
  buttonLabel: z.string(),
  usernameClaim: z.string(),
  emailClaim: z.string(),
  groupsClaim: z.string(),
  allowedGroups: z.array(z.string()),
  adminGroups: z.array(z.string()),
  autoCreateUsers: z.boolean(),
});
export type OidcConfig = z.infer<typeof OidcConfig>;

export const OidcConfigResponse = z.object({ config: OidcConfig });
export type OidcConfigResponse = z.infer<typeof OidcConfigResponse>;

export const OidcTestResult = z.union([
  z.object({
    ok: z.literal(true),
    issuer: z.string(),
    authorizationEndpoint: z.string().nullable(),
    tokenEndpoint: z.string().nullable(),
    jwksUri: z.string().nullable(),
  }),
  z.object({ ok: z.literal(false), error: z.string(), detail: z.string().optional() }),
]);
export type OidcTestResult = z.infer<typeof OidcTestResult>;

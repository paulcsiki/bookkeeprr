import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Auth family — request schemas are the single source of truth, used BOTH for
// runtime validation in the route handlers (app/api/auth/**) and for the
// generated OpenAPI spec. OidcConfigSchema / ForwardAuthConfigSchema are also
// the persistence schemas: src/server/db/settings/{oidc,forward-auth}.ts
// re-import them from here.
//
// Auth-mode reality (verified against the handlers, 2026-06):
// - The proxy (src/proxy.ts) exempts ALL of /api/auth/* from the middleware
//   gate; each handler self-gates.
// - me, me/profile, me/notifications, change-password, sessions, logout/all
//   read the session COOKIE directly — bearer tokens / X-Api-Key do not work.
// - me/api-keys and me/totp* run the full auth stack (cookie, bearer, personal
//   API key, forward-auth) but reject the X-Api-Key "system" actor.
// - Error envelope: this family predates the `{ error }` envelope — nearly all
//   errors are `{ message }` (MessageResponse).
// ─────────────────────────────────────────────────────────────────────────────

/** `{ ok: true }` — bare success acknowledgement used across the family. */
export const AuthOkResponse = z.object({ ok: z.literal(true) });

// ─── Login / first admin ─────────────────────────────────────────────────────

/** POST /api/auth/login body. Accepts JSON or a classic form POST
 *  (`application/x-www-form-urlencoded` / `multipart/form-data`). */
export const LoginBody = z.object({
  // The username is trimmed defensively (mobile keyboards/autofill pad it);
  // the lookup is case-insensitive. Passwords are intentionally NOT trimmed.
  username: z.string().trim().min(1),
  password: z.string(),
  return_to: z
    .string()
    .optional()
    .describe(
      'Mobile onboarding only — MUST be a `bookkeeprr://` URL. On success the ' +
        'response carries `redirect_to` with a one-time exchange code appended ' +
        '(or, for non-JSON form posts, a real 302 to it).',
    ),
});

/** The session-user snapshot returned by login / login/totp. */
export const SessionUser = z.object({
  id: z.number().int(),
  username: z.string(),
  role: z.enum(['admin', 'user']),
  mustChangePassword: z.boolean(),
});

/** POST /api/auth/login 200 when credentials are valid and 2FA is OFF
 *  (also POST /api/auth/login/totp 200). Sets the session cookie. */
export const LoginSuccessResponse = z.object({
  user: SessionUser,
  redirect_to: z
    .string()
    .optional()
    .describe('Only when a valid `return_to` was sent — `bookkeeprr://…?exchange=…`.'),
});

/** POST /api/auth/login 200 when the account has TOTP enabled: no session is
 *  issued yet — complete the challenge via POST /api/auth/login/totp. */
export const LoginTotpChallengeResponse = z.object({
  requiresTotp: z.literal(true),
  challengeToken: z.string().describe('Short-lived signed token; pass to /api/auth/login/totp.'),
});

/** POST /api/auth/login 200 — one of the two success shapes. */
export const LoginResponse = z.union([LoginSuccessResponse, LoginTotpChallengeResponse]);

/** POST /api/auth/login totp-step body. */
export const LoginTotpBody = z.object({
  challengeToken: z.string().min(1),
  code: z
    .string()
    .min(1)
    .describe('A 6-digit TOTP code OR a `xxxx-xxxx-xxxx` recovery code (consumed on use).'),
  return_to: z.string().optional(),
});

/** POST /api/auth/register-first-admin body. */
export const RegisterFirstAdminBody = z.object({
  email: z.string().trim().email().max(254).describe('Doubles as the username.'),
  password: z.string().describe('Must satisfy the password policy (min 8 chars).'),
});

/** POST /api/auth/register-first-admin 201. Sets the session cookie. */
export const RegisterFirstAdminResponse = z.object({
  user: z.object({
    id: z.number().int(),
    username: z.string(),
    email: z.string(),
    role: z.literal('admin'),
  }),
});

// ─── Me ──────────────────────────────────────────────────────────────────────

/** The current-user shape from GET /api/auth/me. */
export const MeUser = z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  role: z.enum(['admin', 'user']),
  mustChangePassword: z.boolean(),
  avatarUrl: z
    .string()
    .nullable()
    .describe('`/api/auth/me/avatar/{userId}` when an avatar is set.'),
  authSource: z.enum(['local', 'oidc', 'forward_auth']),
  totpEnabledAt: z
    .number()
    .int()
    .nullable()
    .describe('Epoch milliseconds (NOT an ISO string); null when 2FA is off.'),
});

/** GET /api/auth/me 200 — `user` is null (NOT a 401) when the request carries
 *  no valid session cookie. */
export const MeResponse = z.object({ user: MeUser.nullable() });

/** DELETE /api/auth/me body — self-service account deletion. */
export const MeDeleteBody = z.object({
  currentPassword: z.string().describe('Local accounts only — OIDC/forward-auth get 400.'),
});

/** PATCH /api/auth/me/profile body. "" clears the field (stored as null). */
export const MeProfilePatchBody = z.object({
  displayName: z.string().trim().max(80).optional(),
  email: z.string().trim().max(254).optional().describe('"" clears; otherwise must be a valid email.'),
});

/** PATCH /api/auth/me/profile 200. */
export const MeProfileResponse = z.object({
  user: z.object({
    id: z.number().int(),
    username: z.string(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    role: z.enum(['admin', 'user']),
  }),
});

/** Per-user notification preferences row. */
export const NotificationPrefs = z.object({
  userId: z.number().int(),
  eventGrabSuccess: z.boolean(),
  eventImportSuccess: z.boolean(),
  eventFailure: z.boolean(),
  eventUpdateAvailable: z.boolean(),
  channel: z.enum(['email', 'push', 'webhook']),
});

/** GET|PATCH /api/auth/me/notifications 200. */
export const NotificationPrefsResponse = z.object({ prefs: NotificationPrefs });

/** PATCH /api/auth/me/notifications body — strict partial merge. */
export const MeNotificationsPatchBody = z
  .object({
    eventGrabSuccess: z.boolean().optional(),
    eventImportSuccess: z.boolean().optional(),
    eventFailure: z.boolean().optional(),
    eventUpdateAvailable: z.boolean().optional(),
    channel: z.enum(['email', 'push', 'webhook']).optional(),
  })
  .strict();

// ─── Personal API keys ───────────────────────────────────────────────────────

/** POST /api/auth/me/api-keys body. */
export const ApiKeyCreateBody = z.object({ name: z.string().min(1).max(100) });

/** A personal API key row (the secret is never re-shown after creation). */
export const ApiKeyListItem = z.object({
  id: z.number().int(),
  name: z.string(),
  keyPrefix: z.string().describe('First 8 chars of the random part, for display.'),
  createdAt: z.string().describe('ISO timestamp.'),
  lastUsedAt: z.string().nullable().describe('ISO timestamp; null when never used.'),
});

/** GET /api/auth/me/api-keys 200. */
export const ApiKeysListResponse = z.object({ keys: z.array(ApiKeyListItem) });

/** POST /api/auth/me/api-keys 201 — `plaintext` (`bkr_…`) is shown ONCE. */
export const ApiKeyCreatedResponse = z.object({
  id: z.number().int(),
  name: z.string(),
  keyPrefix: z.string(),
  plaintext: z.string().describe('The full `bkr_…` key — shown only in this response.'),
});

// ─── TOTP (2FA) ──────────────────────────────────────────────────────────────

/** Password re-confirmation body (DELETE /api/auth/me/totp and
 *  POST /api/auth/me/totp/recovery-codes/regenerate). */
export const PasswordConfirmBody = z.object({
  password: z.string().describe('The current local password.'),
});

/** POST /api/auth/me/totp/setup 200 — nothing is persisted yet; the client
 *  must verify a code via /enable. */
export const TotpSetupResponse = z.object({
  secret: z.string().describe('Base32 TOTP secret.'),
  otpauthUri: z.string(),
  qrCodeDataUrl: z.string().describe('`data:image/png;base64,…` QR of the otpauth URI.'),
  recoveryCodes: z.array(z.string()).describe('10 plaintext recovery codes — shown once.'),
});

/** POST /api/auth/me/totp/enable body — echo the setup payload back with a
 *  valid current code. */
export const TotpEnableBody = z.object({
  secret: z.string().min(1),
  code: z.string().min(6).max(6),
  recoveryCodes: z.array(z.string()).min(10).max(10),
});

/** POST /api/auth/me/totp/recovery-codes/regenerate 200. */
export const RecoveryCodesResponse = z.object({
  recoveryCodes: z.array(z.string()).describe('10 fresh plaintext codes — shown once.'),
});

// ─── Password / sessions ─────────────────────────────────────────────────────

/** POST /api/auth/change-password body. `currentPassword` is required for a
 *  voluntary change; the forced (`mustChangePassword`) flow skips it. */
export const ChangePasswordBody = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string(),
});

/** A session row as listed by GET /api/auth/sessions. */
export const SessionListItem = z.object({
  id: z.string().describe('First 12 chars of the session token — the revoke handle.'),
  createdAt: z.string().describe('ISO timestamp.'),
  lastSeenAt: z.string().describe('ISO timestamp.'),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  current: z.boolean().describe('True for the session making this request.'),
});

/** GET /api/auth/sessions 200. */
export const SessionsListResponse = z.object({ sessions: z.array(SessionListItem) });

// ─── OIDC ────────────────────────────────────────────────────────────────────

/** OIDC SSO configuration — persistence schema (settings key `oidc-config`)
 *  AND the GET/PATCH /api/auth/oidc/config view. */
export const OidcConfigSchema = z.object({
  enabled: z.boolean(),
  issuer: z.string(),
  clientId: z.string(),
  clientSecret: z
    .string()
    .describe(
      'Masked to "••••••••" on GET ("" when unset). On PATCH: "" keeps the ' +
        'stored secret, null clears it (and force-disables OIDC), a real ' +
        'value rotates it.',
    ),
  scopes: z.array(z.string()),
  buttonLabel: z.string(),
  usernameClaim: z.string(),
  emailClaim: z.string(),
  groupsClaim: z.string(),
  allowedGroups: z.array(z.string()),
  adminGroups: z.array(z.string()),
  autoCreateUsers: z.boolean(),
});

/** GET|PATCH /api/auth/oidc/config 200 — `clientSecret` comes back masked. */
export const OidcConfigResponse = z.object({ config: OidcConfigSchema });

/** PATCH /api/auth/oidc/config body — partial merge. */
export const OidcConfigPatchBody = OidcConfigSchema.partial().extend({
  clientSecret: z
    .union([z.string(), z.null()])
    .optional()
    .describe('"" keeps the stored secret; null clears it AND disables OIDC.'),
});

/** GET /api/auth/oidc/info 200 — login-page hint, no secrets. */
export const OidcInfoResponse = z.object({
  enabled: z.boolean().describe('True only when OIDC is enabled AND fully configured.'),
  buttonLabel: z.string(),
});

/** POST /api/auth/oidc/test body. */
export const OidcTestBody = z.object({
  issuer: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z
    .string()
    .optional()
    .describe('Blank/absent/masked ("••••••••") falls back to the stored secret.'),
});

/** POST /api/auth/oidc/test 200 — discovery succeeded. */
export const OidcTestResponse = z.object({
  ok: z.literal(true),
  issuer: z.string(),
  authorizationEndpoint: z.string().nullable(),
  tokenEndpoint: z.string().nullable(),
  jwksUri: z.string().nullable(),
});

/** POST /api/auth/oidc/test 502 — discovery failed. */
export const OidcTestFailureResponse = z.object({
  ok: z.literal(false),
  error: z.literal('discovery_failed'),
  detail: z.string(),
});

// ─── Forward auth ────────────────────────────────────────────────────────────

/** Forward-auth (reverse-proxy header auth) configuration — persistence schema
 *  (settings key `forward-auth-config`) AND the GET/PATCH
 *  /api/auth/forward-auth/config view. Nothing here is a secret; the config
 *  round-trips unmasked. */
export const ForwardAuthConfigSchema = z.object({
  enabled: z.boolean(),
  trustedProxies: z.array(z.string()).describe('CIDR list; every entry is validated on PATCH.'),
  userHeader: z.string(),
  emailHeader: z.string(),
  groupsHeader: z.string(),
  autoCreateUsers: z.boolean(),
  allowedGroups: z.array(z.string()),
  adminGroups: z.array(z.string()),
});

/** GET|PATCH /api/auth/forward-auth/config 200. */
export const ForwardAuthConfigResponse = z.object({ config: ForwardAuthConfigSchema });

/** PATCH /api/auth/forward-auth/config body — partial merge. */
export const ForwardAuthConfigPatchBody = ForwardAuthConfigSchema.partial();

/** PATCH /api/auth/forward-auth/config 422 — either an invalid CIDR list, or
 *  the enable-transition readiness report (turning `enabled` on requires the
 *  CURRENT request to already arrive via a trusted proxy with the user header
 *  set). */
export const ForwardAuthConfigPatch422 = z.union([
  z.object({ error: z.literal('invalid_cidr'), invalidCidrs: z.array(z.string()) }),
  z.object({
    ready: z.literal(false),
    peerIp: z.string().nullable(),
    clientIp: z.string().nullable(),
    peerInTrustedProxies: z.boolean(),
    userHeaderName: z.string(),
    userHeaderPresent: z.boolean(),
    userHeaderValue: z.string().nullable(),
  }),
]);

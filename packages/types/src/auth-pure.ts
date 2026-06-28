// Canonical auth-mode + user-source values — the single source of truth shared
// by the web server (API routes + DB) and the mobile app, so their schemas
// cannot drift. (Drift between mobile `forms|oidc|proxy` and the server's
// `password|oidc|forward_auth` broke iOS login on 2026-05-29.) Zod-free so DB
// modules / migration tooling can import it without bundling zod.

/** Auth methods a server advertises in the mobile handshake. */
export const AUTH_MODES = ['password', 'oidc', 'forward_auth'] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/** How a user account was provisioned. */
export const USER_SOURCES = ['local', 'oidc', 'forward_auth'] as const;
export type UserSource = (typeof USER_SOURCES)[number];

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Users family (admin user management) — request schemas are the single source
// of truth, used BOTH for runtime validation in the route handlers
// (app/api/users/**) and for the generated OpenAPI spec.
//
// Every endpoint is admin-only; all errors use the `{ message }` envelope.
// ─────────────────────────────────────────────────────────────────────────────

/** Fields shared by both admin user views (a `users` row minus
 *  `passwordHash`; timestamps serialize to ISO strings). */
const adminUserFields = {
  id: z.number().int(),
  username: z.string(),
  role: z.enum(['admin', 'user']),
  mustChangePassword: z.boolean(),
  disabled: z.boolean(),
  authSource: z.enum(['local', 'oidc', 'forward_auth']),
  oidcIssuer: z.string().nullable(),
  oidcSubject: z.string().nullable(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  createdAt: z.string().describe('ISO timestamp.'),
  updatedAt: z.string().describe('ISO timestamp.'),
  lastLoginAt: z.string().nullable().describe('ISO timestamp; null when never logged in.'),
  lastSeenChangelogVersion: z.string().nullable(),
  totpEnabledAt: z.string().nullable().describe('ISO timestamp; null when 2FA is off.'),
};

/** A user as listed by GET /api/users — the avatar is exposed as `avatarUrl`. */
export const AdminUserListItem = z.object({
  ...adminUserFields,
  avatarUrl: z
    .string()
    .nullable()
    .describe('`/api/auth/me/avatar/{userId}` when an avatar is set.'),
});

/** GET /api/users 200. */
export const UsersListResponse = z.object({ users: z.array(AdminUserListItem) });

/** POST /api/users body. */
export const UserCreateBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().describe('Must satisfy the password policy (min 8 chars).'),
  role: z.enum(['admin', 'user']),
  mustChangePassword: z.boolean().optional().describe('Defaults to true.'),
});

/** POST /api/users 201 — unlike the list view, the created row carries the
 *  raw `avatarPath` (always null for a fresh user), not `avatarUrl`. */
export const UserCreatedResponse = z.object({
  user: z.object({
    ...adminUserFields,
    avatarPath: z.string().nullable(),
  }),
});

/** PATCH /api/users/{id} body. */
export const UserPatchBody = z.object({
  role: z.enum(['admin', 'user']).optional(),
  disabled: z
    .boolean()
    .optional()
    .describe('Disabling revokes all of the user’s sessions.'),
});

/** POST /api/users/{id}/reset-password body. */
export const UserResetPasswordBody = z.object({
  newPassword: z.string().describe('Must satisfy the password policy (min 8 chars).'),
  mustChangePassword: z.boolean().optional().describe('Defaults to true.'),
});

/** `{ ok: true }` — success acknowledgement for update/reset. */
export const UserOkResponse = z.object({ ok: z.literal(true) });

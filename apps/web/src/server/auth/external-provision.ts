import type { UserRow } from '@/server/db/schema';

export type ExternalAuthSource = 'oidc' | 'forward_auth';

export type ExternalAuthClaims = {
  source: ExternalAuthSource;
  username: string;
  email: string | null;
  groups: string[];
  oidcIssuer: string | null;
  oidcSubject: string | null;
};

export type ExternalProvisionPolicy = {
  allowedGroups: string[];
  adminGroups: string[];
  autoCreateUsers: boolean;
};

export type ExternalProvisionContext = {
  policy: ExternalProvisionPolicy;
  existingUser: UserRow | null;
  usernameCollision: UserRow | null;
  activeAdminCount: number;
};

export type ExternalUserInsert = {
  username: string;
  role: 'admin' | 'user';
  authSource: ExternalAuthSource;
  oidcIssuer: string | null;
  oidcSubject: string | null;
  email: string | null;
};

export type ExternalProvisionResult =
  | { kind: 'denied'; reason: 'no_allowed_group' | 'username_conflict' | 'auto_create_disabled' }
  | { kind: 'login_existing'; userId: number; newRole: 'admin' | 'user'; roleChanged: boolean }
  | { kind: 'create'; insert: ExternalUserInsert };

function intersects(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const sa = new Set(a);
  for (const x of b) if (sa.has(x)) return true;
  return false;
}

export function provisionExternalUser(
  claims: ExternalAuthClaims,
  ctx: ExternalProvisionContext,
): ExternalProvisionResult {
  const desiredRole: 'admin' | 'user' = intersects(ctx.policy.adminGroups, claims.groups)
    ? 'admin'
    : 'user';
  const hasAllowedGroup =
    ctx.policy.allowedGroups.length === 0 || intersects(ctx.policy.allowedGroups, claims.groups);

  if (ctx.existingUser !== null) {
    const wouldDemoteOnlyAdmin =
      ctx.existingUser.role === 'admin' && desiredRole === 'user' && ctx.activeAdminCount <= 1;
    const newRole: 'admin' | 'user' = wouldDemoteOnlyAdmin ? 'admin' : desiredRole;
    return {
      kind: 'login_existing',
      userId: ctx.existingUser.id,
      newRole,
      roleChanged: ctx.existingUser.role !== newRole,
    };
  }

  if (!hasAllowedGroup) return { kind: 'denied', reason: 'no_allowed_group' };
  if (!ctx.policy.autoCreateUsers) return { kind: 'denied', reason: 'auto_create_disabled' };
  if (ctx.usernameCollision !== null) return { kind: 'denied', reason: 'username_conflict' };

  return {
    kind: 'create',
    insert: {
      username: claims.username,
      role: desiredRole,
      authSource: claims.source,
      oidcIssuer: claims.oidcIssuer,
      oidcSubject: claims.oidcSubject,
      email: claims.email,
    },
  };
}

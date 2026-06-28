import {
  getUserByUsername,
  countActiveAdmins,
  updateUser,
  insertForwardAuthUser,
} from '@/server/db/users';
import {
  provisionExternalUser,
  type ExternalProvisionPolicy,
} from '@/server/auth/external-provision';
import { logForwardAuthLoginSuccess, logForwardAuthRoleRecompute } from '@/server/auth/events';

export type ForwardAuthAttempt =
  | { kind: 'not_applicable' }
  | { kind: 'authenticated'; userId: number; role: 'admin' | 'user' }
  | {
      kind: 'failure';
      reason: 'no_allowed_group' | 'username_conflict' | 'auto_create_disabled' | 'user_disabled';
    };

export async function findOrProvisionForwardAuthUser(input: {
  username: string;
  email: string | null;
  groups: string[];
  policy: ExternalProvisionPolicy;
  peerIp: string;
  clientIp: string | null;
  userAgent: string | null;
}): Promise<ForwardAuthAttempt> {
  const existing = await getUserByUsername(input.username);

  const usernameCollision =
    existing !== null && existing.authSource !== 'forward_auth' ? existing : null;
  const sameForwardAuthUser =
    existing !== null && existing.authSource === 'forward_auth' ? existing : null;

  if (sameForwardAuthUser !== null && sameForwardAuthUser.disabled) {
    return { kind: 'failure', reason: 'user_disabled' };
  }

  const activeAdminCount = await countActiveAdmins();

  const result = provisionExternalUser(
    {
      source: 'forward_auth',
      username: input.username,
      email: input.email,
      groups: input.groups,
      oidcIssuer: null,
      oidcSubject: null,
    },
    {
      policy: input.policy,
      existingUser: sameForwardAuthUser,
      usernameCollision,
      activeAdminCount,
    },
  );

  if (result.kind === 'denied') {
    return { kind: 'failure', reason: result.reason };
  }

  let userId: number;
  let role: 'admin' | 'user';

  if (result.kind === 'create') {
    const created = await insertForwardAuthUser({
      username: result.insert.username,
      role: result.insert.role,
      email: result.insert.email,
    });
    userId = created.id;
    role = created.role;
    logForwardAuthLoginSuccess({
      userId,
      username: created.username,
      peerIp: input.peerIp,
      clientIp: input.clientIp,
      userAgent: input.userAgent,
    });
  } else {
    userId = result.userId;
    role = result.newRole;
    const beforeRole = sameForwardAuthUser!.role;
    if (result.roleChanged) {
      await updateUser(userId, { role: result.newRole, lastLoginAt: new Date() });
      logForwardAuthRoleRecompute({
        userId,
        oldRole: beforeRole,
        newRole: result.newRole,
        viaGroups:
          result.newRole === 'admin'
            ? input.policy.adminGroups.filter((g) => input.groups.includes(g))
            : [],
        guardFired: false,
      });
    } else if (
      beforeRole === 'admin' &&
      result.newRole === 'admin' &&
      !input.groups.some((g) => input.policy.adminGroups.includes(g))
    ) {
      logForwardAuthRoleRecompute({
        userId,
        oldRole: beforeRole,
        newRole: result.newRole,
        viaGroups: [],
        guardFired: true,
      });
      await updateUser(userId, { lastLoginAt: new Date() });
    } else {
      await updateUser(userId, { lastLoginAt: new Date() });
    }
  }

  return { kind: 'authenticated', userId, role };
}

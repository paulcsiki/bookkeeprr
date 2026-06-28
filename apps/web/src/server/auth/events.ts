import { createHash } from 'node:crypto';
import { logger } from '@/server/logger';
import { recordAuditEvent } from '@/server/audit/record';

export type LoginFailureReason = 'user_not_found' | 'bad_password' | 'disabled';

export function hashTokenForLog(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

export function logLoginSuccess(input: {
  userId: number;
  username: string;
  ipAddress: string | null;
  userAgent: string | null;
}): void {
  logger().child({ component: 'auth' }).info(
    {
      event: 'login_success',
      userId: input.userId,
      username: input.username,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
    'login_success',
  );
  void recordAuditEvent({
    actor: { kind: 'user', userId: input.userId, username: input.username },
    action: 'auth.login_success',
    context: {
      peerIp: null,
      clientIp: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}

export function logLoginFailure(input: {
  username: string;
  ipAddress: string | null;
  reason: LoginFailureReason;
}): void {
  logger().child({ component: 'auth' }).warn(
    {
      event: 'login_failure',
      username: input.username,
      ipAddress: input.ipAddress,
      reason: input.reason,
    },
    'login_failure',
  );
  void recordAuditEvent({
    actor: { kind: 'anonymous' },
    action: 'auth.login_failure',
    metadata: { reason: input.reason, attemptedUsername: input.username },
    context: {
      peerIp: null,
      clientIp: input.ipAddress,
      userAgent: null,
    },
  });
}

export function logLogout(input: { userId: number; username: string; sessionToken: string }): void {
  logger()
    .child({ component: 'auth' })
    .info(
      {
        event: 'logout',
        userId: input.userId,
        sessionTokenHash: hashTokenForLog(input.sessionToken),
      },
      'logout',
    );
  void recordAuditEvent({
    actor: { kind: 'user', userId: input.userId, username: input.username },
    action: 'auth.logout',
    target: { kind: 'session', id: hashTokenForLog(input.sessionToken) },
  });
}

export function logPasswordChange(input: {
  userId: number;
  username: string;
  byUserId: number;
  byUsername: string;
  forced: boolean;
}): void {
  logger().child({ component: 'auth' }).info(
    {
      event: 'password_change',
      userId: input.userId,
      byUserId: input.byUserId,
      forced: input.forced,
    },
    'password_change',
  );
  void recordAuditEvent({
    actor: { kind: 'user', userId: input.byUserId, username: input.byUsername },
    action: 'auth.password_change',
    target: { kind: 'user', id: String(input.userId) },
    metadata: { targetUsername: input.username, forced: input.forced },
  });
}

export type OidcLoginFailureReason =
  | 'state_mismatch'
  | 'token_invalid'
  | 'discovery_failed'
  | 'no_allowed_group'
  | 'username_conflict'
  | 'auto_create_disabled';

export function logOidcLoginSuccess(input: {
  userId: number;
  username: string;
  oidcSubject: string;
  oidcIssuer: string;
  ipAddress: string | null;
  userAgent: string | null;
}): void {
  logger().child({ component: 'auth' }).info(
    {
      event: 'oidc_login_success',
      userId: input.userId,
      username: input.username,
      oidcSubject: input.oidcSubject,
      oidcIssuer: input.oidcIssuer,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
    'oidc_login_success',
  );
  void recordAuditEvent({
    actor: { kind: 'user', userId: input.userId, username: input.username },
    action: 'auth.oidc_login_success',
    metadata: { oidcSubject: input.oidcSubject, oidcIssuer: input.oidcIssuer },
    context: {
      peerIp: null,
      clientIp: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}

export function logOidcLoginFailure(input: {
  reason: OidcLoginFailureReason;
  ipAddress: string | null;
}): void {
  logger().child({ component: 'auth' }).warn(
    {
      event: 'oidc_login_failure',
      reason: input.reason,
      ipAddress: input.ipAddress,
    },
    'oidc_login_failure',
  );
  void recordAuditEvent({
    actor: { kind: 'anonymous' },
    action: 'auth.oidc_login_failure',
    metadata: { reason: input.reason },
    context: {
      peerIp: null,
      clientIp: input.ipAddress,
      userAgent: null,
    },
  });
}

export function logOidcRoleRecompute(input: {
  userId: number;
  oldRole: 'admin' | 'user';
  newRole: 'admin' | 'user';
  viaGroups: string[];
  guardFired: boolean;
}): void {
  logger().child({ component: 'auth' }).info(
    {
      event: 'oidc_role_recompute',
      userId: input.userId,
      oldRole: input.oldRole,
      newRole: input.newRole,
      viaGroups: input.viaGroups,
      guardFired: input.guardFired,
    },
    'oidc_role_recompute',
  );
  void recordAuditEvent({
    actor: { kind: 'system' },
    action: 'auth.oidc_role_recompute',
    target: { kind: 'user', id: String(input.userId) },
    metadata: {
      oldRole: input.oldRole,
      newRole: input.newRole,
      viaGroups: input.viaGroups,
      guardFired: input.guardFired,
    },
  });
}

export type ForwardAuthLoginFailureReason =
  | 'no_allowed_group'
  | 'username_conflict'
  | 'auto_create_disabled'
  | 'user_disabled';

export function logForwardAuthLoginSuccess(input: {
  userId: number;
  username: string;
  peerIp: string;
  clientIp: string | null;
  userAgent: string | null;
}): void {
  logger().child({ component: 'auth' }).info(
    {
      event: 'forward_auth_login_success',
      userId: input.userId,
      username: input.username,
      peerIp: input.peerIp,
      clientIp: input.clientIp,
      userAgent: input.userAgent,
    },
    'forward_auth_login_success',
  );
  void recordAuditEvent({
    actor: { kind: 'user', userId: input.userId, username: input.username },
    action: 'auth.forward_auth_login_success',
    context: {
      peerIp: input.peerIp,
      clientIp: input.clientIp,
      userAgent: input.userAgent,
    },
  });
}

export function logForwardAuthLoginFailure(input: {
  reason: ForwardAuthLoginFailureReason;
  peerIp: string | null;
  clientIp: string | null;
}): void {
  logger().child({ component: 'auth' }).warn(
    {
      event: 'forward_auth_login_failure',
      reason: input.reason,
      peerIp: input.peerIp,
      clientIp: input.clientIp,
    },
    'forward_auth_login_failure',
  );
  void recordAuditEvent({
    actor: { kind: 'anonymous' },
    action: 'auth.forward_auth_login_failure',
    metadata: { reason: input.reason },
    context: {
      peerIp: input.peerIp,
      clientIp: input.clientIp,
      userAgent: null,
    },
  });
}

export function logForwardAuthRoleRecompute(input: {
  userId: number;
  oldRole: 'admin' | 'user';
  newRole: 'admin' | 'user';
  viaGroups: string[];
  guardFired: boolean;
}): void {
  logger().child({ component: 'auth' }).info(
    {
      event: 'forward_auth_role_recompute',
      userId: input.userId,
      oldRole: input.oldRole,
      newRole: input.newRole,
      viaGroups: input.viaGroups,
      guardFired: input.guardFired,
    },
    'forward_auth_role_recompute',
  );
  void recordAuditEvent({
    actor: { kind: 'system' },
    action: 'auth.forward_auth_role_recompute',
    target: { kind: 'user', id: String(input.userId) },
    metadata: {
      oldRole: input.oldRole,
      newRole: input.newRole,
      viaGroups: input.viaGroups,
      guardFired: input.guardFired,
    },
  });
}

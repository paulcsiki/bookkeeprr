#!/usr/bin/env node
// Usage: node scripts/reset-user-password.cjs <username> <newPassword>
//
// Resets the user's password and forces them to change it on next login.
// Revokes all of the user's existing sessions.
//
// Exits:
//   0 on success
//   1 on missing arguments
//   2 on user not found
//   3 on password policy violation
//   4 on DB error

import { hashPassword, validatePasswordPolicy } from '../src/server/auth/password';
import { getUserByUsername, updateUser } from '../src/server/db/users';
import { revokeAllSessionsForUser } from '../src/server/db/sessions';

async function main(): Promise<void> {
  const [, , username, newPassword] = process.argv;
  if (!username || !newPassword) {
    console.error('Usage: reset-user-password <username> <newPassword>');
    process.exit(1);
  }
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.ok) {
    console.error(`Password policy: ${policy.reason}`);
    process.exit(3);
  }
  const user = await getUserByUsername(username);
  if (user === null) {
    console.error(`User not found: ${username}`);
    process.exit(2);
  }
  try {
    const hash = await hashPassword(newPassword);
    await updateUser(user.id, { passwordHash: hash, mustChangePassword: true });
    const revoked = await revokeAllSessionsForUser(user.id);
    console.log(`Reset password for user ${user.username} (id=${user.id})`);
    console.log(`Revoked ${revoked} active session(s)`);
    console.log(`User will be prompted to change password on next login`);
  } catch (err) {
    console.error(`Failed: ${(err as Error).message}`);
    process.exit(4);
  }
}

void main();

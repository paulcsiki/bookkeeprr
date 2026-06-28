#!/usr/bin/env node
// Seed a local admin user for real-server mobile e2e runs.
//
// The mobile Maestro real-server flow logs in via the env-gated exchange
// bypass (BOOKKEEPRR_E2E_LOGIN_BYPASS=1), which issues a token for an existing
// user. This script guarantees that user exists before the server starts.
//
// Idempotent: re-running with an existing username is a no-op.
//
// Usage: tsx scripts/e2e-seed-user.ts [username] [password]
//   username  defaults to $BOOKKEEPRR_E2E_LOGIN_USERNAME, then "e2e"
//   password  defaults to "e2e-password-1234" (unused by the bypass, but set
//             so password login also works if a flow exercises it)

import { hashPassword } from '../src/server/auth/password';
import { getUserByUsername, insertUser } from '../src/server/db/users';

async function main(): Promise<void> {
  const username = process.argv[2] ?? process.env.BOOKKEEPRR_E2E_LOGIN_USERNAME ?? 'e2e';
  const password = process.argv[3] ?? 'e2e-password-1234';

  const existing = await getUserByUsername(username);
  if (existing !== null) {
    console.log(`e2e user already present: ${existing.username} (id=${existing.id})`);
    return;
  }

  const user = await insertUser({
    username,
    passwordHash: await hashPassword(password),
    role: 'admin',
    mustChangePassword: false,
  });
  console.log(`Seeded e2e user ${user.username} (id=${user.id})`);
}

void main();

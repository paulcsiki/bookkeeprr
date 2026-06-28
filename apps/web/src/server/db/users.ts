import { and, eq, sql, asc } from 'drizzle-orm';
import { getDb } from './client';
import { users, type UserRow } from './schema';
import { withWriteLock } from './write-lock';

export type InsertUserInput = {
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  mustChangePassword: boolean;
  email?: string | null;
};

export type UpdateUserPatch = Partial<{
  role: 'admin' | 'user';
  disabled: boolean;
  mustChangePassword: boolean;
  passwordHash: string;
  lastLoginAt: Date;
  lastSeenChangelogVersion: string;
  // TOTP fields (DS11b-3)
  totpSecretEncrypted: string | null;
  totpEnabledAt: Date | null;
  totpRecoveryCodesHashed: string | null;
  displayName: string | null;
  email: string | null;
}>;

export async function insertUser(input: InsertUserInput): Promise<UserRow> {
  return withWriteLock(async () => {
    // Case-insensitive duplicate check (schema's UNIQUE is case-sensitive).
    const existing = await getUserByUsername(input.username);
    if (existing !== null) {
      throw new Error('UNIQUE constraint failed: users.username (case-insensitive)');
    }
    const [row] = await getDb()
      .insert(users)
      .values({
        username: input.username,
        passwordHash: input.passwordHash,
        role: input.role,
        mustChangePassword: input.mustChangePassword,
        email: input.email ?? null,
      })
      .returning();
    if (!row) throw new Error('insertUser: insert returned no row');
    return row;
  });
}

export type InsertOidcUserInput = {
  username: string;
  role: 'admin' | 'user';
  oidcIssuer: string;
  oidcSubject: string;
  email: string | null;
};

export async function insertOidcUser(input: InsertOidcUserInput): Promise<UserRow> {
  return withWriteLock(async () => {
    const existing = await getUserByUsername(input.username);
    if (existing !== null) {
      throw new Error('UNIQUE constraint failed: users.username (case-insensitive)');
    }
    const [row] = await getDb()
      .insert(users)
      .values({
        username: input.username,
        passwordHash: null,
        role: input.role,
        mustChangePassword: false,
        disabled: false,
        authSource: 'oidc',
        oidcIssuer: input.oidcIssuer,
        oidcSubject: input.oidcSubject,
        email: input.email,
      })
      .returning();
    if (!row) throw new Error('insertOidcUser: insert returned no row');
    return row;
  });
}

export type InsertForwardAuthUserInput = {
  username: string;
  role: 'admin' | 'user';
  email: string | null;
};

export async function insertForwardAuthUser(input: InsertForwardAuthUserInput): Promise<UserRow> {
  return withWriteLock(async () => {
    const existing = await getUserByUsername(input.username);
    if (existing !== null) {
      throw new Error('UNIQUE constraint failed: users.username (case-insensitive)');
    }
    const [row] = await getDb()
      .insert(users)
      .values({
        username: input.username,
        passwordHash: null,
        role: input.role,
        mustChangePassword: false,
        disabled: false,
        authSource: 'forward_auth',
        oidcIssuer: null,
        oidcSubject: null,
        email: input.email,
      })
      .returning();
    if (!row) throw new Error('insertForwardAuthUser: insert returned no row');
    return row;
  });
}

export async function findUserByOidcSubject(
  issuer: string,
  subject: string,
): Promise<UserRow | null> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.oidcIssuer, issuer), eq(users.oidcSubject, subject)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUser(id: number): Promise<UserRow | null> {
  const rows = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByUsername(username: string): Promise<UserRow | null> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(sql`LOWER(${users.username}) = LOWER(${username})`)
    .limit(1);
  return rows[0] ?? null;
}

export async function listUsers(): Promise<UserRow[]> {
  return getDb().select().from(users).orderBy(asc(users.id));
}

export async function updateUser(id: number, patch: UpdateUserPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await withWriteLock(() =>
    getDb()
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id)),
  );
}

export async function deleteUser(id: number): Promise<void> {
  await withWriteLock(() => getDb().delete(users).where(eq(users.id, id)));
}

export async function countUsers(): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(users);
  return Number(row?.count ?? 0);
}

export async function countActiveAdmins(): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.disabled, false)));
  return Number(row?.count ?? 0);
}

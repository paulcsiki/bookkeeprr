import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import {
  insertUser,
  getUser,
  getUserByUsername,
  listUsers,
  updateUser,
  deleteUser,
  countUsers,
  countActiveAdmins,
  findUserByOidcSubject,
  insertOidcUser,
  insertForwardAuthUser,
} from '@/server/db/users';
import { users } from '@/server/db/schema';
import { getDb } from '@/server/db/client';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('users DAL', () => {
  it('countUsers returns 0 on a fresh DB', async () => {
    expect(await countUsers()).toBe(0);
  });

  it('insertUser + getUser round-trip', async () => {
    const u = await insertUser({
      username: 'alice',
      passwordHash: 'hash-1',
      role: 'admin',
      mustChangePassword: false,
    });
    expect(u.id).toBeGreaterThan(0);
    expect(u.username).toBe('alice');
    expect(u.role).toBe('admin');
    expect(u.mustChangePassword).toBe(false);
    expect(u.disabled).toBe(false);
    const reload = await getUser(u.id);
    expect(reload).not.toBeNull();
    expect(reload!.username).toBe('alice');
  });

  it('getUserByUsername is case-insensitive', async () => {
    await insertUser({
      username: 'Alice',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    const a = await getUserByUsername('alice');
    const b = await getUserByUsername('ALICE');
    const c = await getUserByUsername('AlIcE');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).not.toBeNull();
    expect(a!.username).toBe('Alice');
  });

  it('insertUser rejects duplicate username (case-insensitive)', async () => {
    await insertUser({
      username: 'bob',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    await expect(
      insertUser({
        username: 'Bob',
        passwordHash: 'h2',
        role: 'user',
        mustChangePassword: false,
      }),
    ).rejects.toThrow();
  });

  it('listUsers returns inserted users sorted by id', async () => {
    await insertUser({
      username: 'a',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    await insertUser({ username: 'b', passwordHash: 'h', role: 'user', mustChangePassword: false });
    const rows = await listUsers();
    expect(rows.map((r) => r.username)).toEqual(['a', 'b']);
  });

  it('updateUser updates role + disabled', async () => {
    const u = await insertUser({
      username: 'c',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    await updateUser(u.id, { role: 'admin', disabled: true });
    const reload = await getUser(u.id);
    expect(reload!.role).toBe('admin');
    expect(reload!.disabled).toBe(true);
  });

  it('deleteUser removes the row', async () => {
    const u = await insertUser({
      username: 'd',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    await deleteUser(u.id);
    expect(await getUser(u.id)).toBeNull();
  });

  it('countActiveAdmins counts only non-disabled admins', async () => {
    await insertUser({
      username: 'e',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    await insertUser({ username: 'f', passwordHash: 'h', role: 'user', mustChangePassword: false });
    const g = await insertUser({
      username: 'g',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    await updateUser(g.id, { disabled: true });
    expect(await countActiveAdmins()).toBe(1);
  });

  it('users.passwordHash may be null (for OIDC-authenticated users)', async () => {
    const [row] = await getDb()
      .insert(users)
      .values({
        username: 'oidc-test',
        passwordHash: null,
        role: 'user',
        mustChangePassword: false,
        disabled: false,
        authSource: 'oidc',
        oidcIssuer: 'https://idp.example.com/',
        oidcSubject: 'abc123',
        email: 'oidc-test@example.com',
      })
      .returning();
    expect(row?.passwordHash).toBe(null);
    expect(row?.authSource).toBe('oidc');
  });

  describe('OIDC additions', () => {
    it('findUserByOidcSubject returns the matching row', async () => {
      const inserted = await insertOidcUser({
        username: 'alice',
        role: 'user',
        oidcIssuer: 'https://idp.example.com/',
        oidcSubject: 'oidc|alice',
        email: 'alice@example.com',
      });
      const found = await findUserByOidcSubject('https://idp.example.com/', 'oidc|alice');
      expect(found?.id).toBe(inserted.id);
      expect(found?.authSource).toBe('oidc');
      expect(found?.passwordHash).toBe(null);
    });

    it('findUserByOidcSubject returns null when no match', async () => {
      const found = await findUserByOidcSubject('https://idp.example.com/', 'nope');
      expect(found).toBe(null);
    });

    it('insertOidcUser persists email and authSource', async () => {
      const u = await insertOidcUser({
        username: 'bob',
        role: 'admin',
        oidcIssuer: 'https://idp.example.com/',
        oidcSubject: 'oidc|bob',
        email: 'bob@example.com',
      });
      expect(u.authSource).toBe('oidc');
      expect(u.email).toBe('bob@example.com');
      expect(u.role).toBe('admin');
      expect(u.mustChangePassword).toBe(false);
      expect(u.disabled).toBe(false);
    });

    it('insertOidcUser rejects duplicate (issuer, subject)', async () => {
      await insertOidcUser({
        username: 'carol',
        role: 'user',
        oidcIssuer: 'https://idp.example.com/',
        oidcSubject: 'oidc|carol',
        email: 'carol@example.com',
      });
      await expect(
        insertOidcUser({
          username: 'carol-2',
          role: 'user',
          oidcIssuer: 'https://idp.example.com/',
          oidcSubject: 'oidc|carol', // same subject
          email: 'carol2@example.com',
        }),
      ).rejects.toThrow(/UNIQUE/i);
    });

    it('insertOidcUser rejects username collision with a local user', async () => {
      await insertUser({
        username: 'dave',
        passwordHash: 'fake',
        role: 'user',
        mustChangePassword: false,
      });
      await expect(
        insertOidcUser({
          username: 'dave',
          role: 'user',
          oidcIssuer: 'https://idp.example.com/',
          oidcSubject: 'oidc|dave',
          email: 'dave@example.com',
        }),
      ).rejects.toThrow(/UNIQUE/i);
    });
  });

  describe('forward-auth additions', () => {
    it('insertForwardAuthUser persists authSource and email', async () => {
      const u = await insertForwardAuthUser({
        username: 'fwd-alice',
        role: 'user',
        email: 'fwd-alice@example.com',
      });
      expect(u.authSource).toBe('forward_auth');
      expect(u.email).toBe('fwd-alice@example.com');
      expect(u.passwordHash).toBe(null);
      expect(u.oidcIssuer).toBe(null);
      expect(u.oidcSubject).toBe(null);
      expect(u.mustChangePassword).toBe(false);
      expect(u.disabled).toBe(false);
    });

    it('insertForwardAuthUser accepts null email', async () => {
      const u = await insertForwardAuthUser({
        username: 'fwd-bob',
        role: 'admin',
        email: null,
      });
      expect(u.email).toBe(null);
      expect(u.role).toBe('admin');
    });

    it('insertForwardAuthUser rejects username collision with a local user', async () => {
      await insertUser({
        username: 'shared',
        passwordHash: 'fake',
        role: 'user',
        mustChangePassword: false,
      });
      await expect(
        insertForwardAuthUser({
          username: 'shared',
          role: 'user',
          email: null,
        }),
      ).rejects.toThrow(/UNIQUE/i);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import {
  createSession,
  getSessionByToken,
  refreshSession,
  revokeSession,
  revokeAllSessionsForUser,
  pruneExpiredSessions,
} from '@/server/db/sessions';

let h: SeedHandle;
let userId: number;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  const u = await insertUser({
    username: 'tester',
    passwordHash: 'h',
    role: 'user',
    mustChangePassword: false,
  });
  userId = u.id;
});
afterEach(() => h.cleanup());

describe('sessions DAL', () => {
  it('createSession returns a row with future expiresAt', async () => {
    const s = await createSession({ userId, userAgent: 'ua', ipAddress: '1.2.3.4' });
    expect(s.token.length).toBe(43);
    expect(s.userId).toBe(userId);
    expect(s.userAgent).toBe('ua');
    expect(s.ipAddress).toBe('1.2.3.4');
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('getSessionByToken returns the row', async () => {
    const s = await createSession({ userId, userAgent: null, ipAddress: null });
    const reload = await getSessionByToken(s.token);
    expect(reload).not.toBeNull();
    expect(reload!.userId).toBe(userId);
  });

  it('getSessionByToken returns null for unknown token', async () => {
    expect(await getSessionByToken('not-a-real-token')).toBeNull();
  });

  it('refreshSession bumps lastSeenAt when older than 60s', async () => {
    const s = await createSession({
      userId,
      userAgent: null,
      ipAddress: null,
      lastSeenAtOverride: new Date(Date.now() - 120_000),
    });
    const before = s.lastSeenAt.getTime();
    await refreshSession(s.token);
    const after = await getSessionByToken(s.token);
    expect(after!.lastSeenAt.getTime()).toBeGreaterThan(before);
  });

  it('refreshSession does NOT bump lastSeenAt when newer than 60s', async () => {
    const s = await createSession({ userId, userAgent: null, ipAddress: null });
    const before = s.lastSeenAt.getTime();
    await refreshSession(s.token);
    const after = await getSessionByToken(s.token);
    expect(after!.lastSeenAt.getTime()).toBe(before);
  });

  it('revokeSession deletes the row', async () => {
    const s = await createSession({ userId, userAgent: null, ipAddress: null });
    await revokeSession(s.token);
    expect(await getSessionByToken(s.token)).toBeNull();
  });

  it('revokeAllSessionsForUser deletes all rows + returns count', async () => {
    await createSession({ userId, userAgent: null, ipAddress: null });
    await createSession({ userId, userAgent: null, ipAddress: null });
    await createSession({ userId, userAgent: null, ipAddress: null });
    const count = await revokeAllSessionsForUser(userId);
    expect(count).toBe(3);
  });

  it('pruneExpiredSessions deletes only expired rows + returns count', async () => {
    await createSession({
      userId,
      userAgent: null,
      ipAddress: null,
      expiresAtOverride: new Date(Date.now() - 1000),
    });
    await createSession({ userId, userAgent: null, ipAddress: null });
    const count = await pruneExpiredSessions();
    expect(count).toBe(1);
  });

  it('cascade-deletes sessions when the user is deleted', async () => {
    const s = await createSession({ userId, userAgent: null, ipAddress: null });
    const { deleteUser } = await import('@/server/db/users');
    await deleteUser(userId);
    expect(await getSessionByToken(s.token)).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser, updateUser } from '@/server/db/users';
import { getDb } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { hashPassword } from '@/server/auth/password';
import { issueMobileToken } from '@/server/mobile/tokens';
import { GET } from '@/app/api/mobile/me/route';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});

afterEach(() => {
  h.cleanup();
});

function mkReq(bearer?: string): Request {
  const headers: Record<string, string> = {};
  if (bearer !== undefined) headers.authorization = `Bearer ${bearer}`;
  return new Request('http://localhost/api/mobile/me', { method: 'GET', headers });
}

describe('GET /api/mobile/me', () => {
  it('rejects requests with no bearer header (401)', async () => {
    const res = await GET(mkReq());
    expect(res.status).toBe(401);
  });

  it('rejects an unknown bearer token (401)', async () => {
    const res = await GET(mkReq('not-a-real-token'));
    expect(res.status).toBe(401);
  });

  it('returns the bearer-resolved identity (display name + email)', async () => {
    const user = await insertUser({
      username: 'paul',
      passwordHash: await hashPassword('hunter22'),
      role: 'admin',
      mustChangePassword: false,
    });
    await updateUser(user.id, { displayName: 'Alex Example', email: 'paul@example.com' });
    const issued = await issueMobileToken(user.id);

    const res = await GET(mkReq(issued.token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: number;
      username: string;
      email: string | null;
      displayName: string | null;
      role: string;
    };
    expect(body).toMatchObject({
      id: user.id,
      username: 'paul',
      email: 'paul@example.com',
      displayName: 'Alex Example',
      role: 'admin',
    });
  });

  it('returns avatarUrl null when the user has no avatar', async () => {
    const user = await insertUser({
      username: 'noavatar',
      passwordHash: await hashPassword('hunter22'),
      role: 'user',
      mustChangePassword: false,
    });
    const issued = await issueMobileToken(user.id);
    const res = await GET(mkReq(issued.token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { avatarUrl: string | null };
    expect(body.avatarUrl).toBeNull();
  });

  it('returns the per-user avatar route when an avatar is set', async () => {
    const user = await insertUser({
      username: 'hasavatar',
      passwordHash: await hashPassword('hunter22'),
      role: 'user',
      mustChangePassword: false,
    });
    // avatarPath is written directly (mirroring the avatar-upload route), not
    // via updateUser's patch surface.
    await getDb()
      .update(users)
      .set({ avatarPath: 'avatars/3.png', updatedAt: new Date() })
      .where(eq(users.id, user.id));
    const issued = await issueMobileToken(user.id);
    const res = await GET(mkReq(issued.token));
    const body = (await res.json()) as { avatarUrl: string | null };
    expect(body.avatarUrl).toBe(`/api/auth/me/avatar/${user.id}`);
  });
});

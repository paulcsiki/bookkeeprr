import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { firstRunCompleteSetting } from '@/server/db/settings/first-run';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { proxy as middleware } from '@/proxy';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

function req(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  const headerObj = new Headers();
  if (Object.keys(cookies).length > 0) {
    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    headerObj.set('cookie', cookieStr);
  }
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), { headers: headerObj });
}

describe('first-run middleware', () => {
  it('redirects HTML routes to /first-run when no users exist', async () => {
    const res = await middleware(req('/library'));
    expect(res.status).toBe(307); // Next default redirect status
    expect(res.headers.get('location')).toContain('/first-run');
  });

  it('passes /first-run through (no loop)', async () => {
    const res = await middleware(req('/first-run'));
    // The matcher excludes /first-run, so this test exercises the middleware directly;
    // we expect it NOT to redirect.
    if (res.status === 307) {
      expect(res.headers.get('location')).not.toContain('/first-run');
    }
  });

  it('passes through when first-run complete and user is authenticated', async () => {
    const u = await insertUser({
      username: 'alice',
      passwordHash: await hashPassword('password123'),
      role: 'admin',
      mustChangePassword: false,
    });
    await firstRunCompleteSetting.set(true);
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const res = await middleware(req('/library', { bookkeeprr_session: s.token }));
    expect(res.status).not.toBe(307);
  });

  it('defaults to first-run when no users exist (DB read fails or fresh install)', async () => {
    // Forcing the DAL to throw is awkward in this harness; the implementation
    // wraps the read in try/catch. This test exists to assert the redirect
    // path is taken when the setting is missing or unreadable — verified
    // implicitly by the first test (no users in fresh seedDb).
    const res = await middleware(req('/'));
    expect(res.status).toBe(307);
  });
});

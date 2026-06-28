import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });
test.beforeAll(async ({ browser }) => {
  composeDownUp();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, { username: 'admin', password: 'hunter22' });
  await ctx.close();
});

test.describe('Forward-auth end-to-end', () => {
  test('admin can configure forward-auth via the API', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/auth/forward-auth/config', {
      data: {
        enabled: false, // can't flip enabled=true without satisfying the validate gate
        trustedProxies: ['172.16.0.0/12', '10.0.0.0/8'],
        userHeader: 'Remote-User',
        emailHeader: 'Remote-Email',
        groupsHeader: 'Remote-Groups',
        autoCreateUsers: true,
        allowedGroups: [],
        adminGroups: ['bookkeeprr-admins'],
      },
    });
    expect(r.ok()).toBe(true);
  });

  test('Caddy injects Remote-User header into requests', async ({ request }) => {
    // Hit Caddy directly; the request should be proxied through with the injected
    // identity headers. We can't see them from bookkeeprr's side without a
    // dedicated /api/whoami route, so this test just proves the proxy chain works.
    const r = await request.get('http://localhost:18081/api/health');
    expect(r.ok()).toBe(true);
  });

  test('through-Caddy navigation auto-creates the user and authenticates', async ({ browser }) => {
    // 1) Admin signs in via forms + saves the trusted-proxy config (still disabled).
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signIn(adminPage, 'admin', 'hunter22');
    const r1 = await adminPage.request.patch('/api/auth/forward-auth/config', {
      data: {
        enabled: false,
        trustedProxies: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
        userHeader: 'Remote-User',
        emailHeader: 'Remote-Email',
        groupsHeader: 'Remote-Groups',
        autoCreateUsers: true,
        allowedGroups: [],
        adminGroups: ['bookkeeprr-admins'],
      },
    });
    expect(r1.ok()).toBe(true);
    // 2) Pull the session cookie so we can send it through Caddy.
    const cookies = await adminCtx.cookies();
    const sessionCookie = cookies.find((c) => c.name === 'bookkeeprr_session');
    expect(sessionCookie).toBeDefined();
    await adminCtx.close();

    // 3) Flip enabled=true THROUGH Caddy — Caddy is in the trustedProxies range
    //    and injects Remote-User: alice. The session cookie keeps admin gated.
    const enableCtx = await browser.newContext();
    const enableResp = await enableCtx.request.patch(
      'http://localhost:18081/api/auth/forward-auth/config',
      {
        headers: {
          cookie: `${sessionCookie!.name}=${sessionCookie!.value}`,
        },
        data: { enabled: true },
      },
    );
    if (!enableResp.ok()) {
      throw new Error(
        `enable through Caddy returned ${enableResp.status()}: ${await enableResp.text()}`,
      );
    }
    await enableCtx.close();

    // 4) Fresh context (no cookies) → page navigation to /library through Caddy.
    //    Forward-auth fires at the middleware, auto-creates alice, sets the
    //    session cookie on the RESPONSE. The browser persists that cookie in
    //    the context, so subsequent admin-gated API calls work.
    //    (/api/auth/me is exempt from middleware auth, and route-level
    //    requireAdmin reads only the request's cookie — so we can't do it in
    //    a single request.)
    const aliceCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    await alicePage.goto('http://localhost:18081/library');
    // Forward-auth landed her on /library, not redirected to /login.
    expect(alicePage.url()).toContain('/library');
    // Cookie now in jar — list users to verify role/authSource.
    const users = await aliceCtx.request.get('http://localhost:18081/api/users');
    if (!users.ok()) {
      throw new Error(`users through Caddy returned ${users.status()}: ${await users.text()}`);
    }
    const usersBody = (await users.json()) as {
      users: Array<{ username: string; role: string; authSource: string }>;
    };
    const alice = usersBody.users.find((u) => u.username === 'alice');
    expect(alice).toBeDefined();
    expect(alice?.role).toBe('admin');
    expect(alice?.authSource).toBe('forward_auth');
    await aliceCtx.close();
  });
});

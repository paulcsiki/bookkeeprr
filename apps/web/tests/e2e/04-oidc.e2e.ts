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

const OIDC_ISSUER = 'http://host.docker.internal:18080/bookkeeprr';

test.describe('OIDC end-to-end', () => {
  test('PATCH /api/auth/oidc/config saves the IdP config', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/auth/oidc/config', {
      data: {
        enabled: false,
        issuer: OIDC_ISSUER,
        clientId: 'bookkeeprr-e2e',
        clientSecret: 'any-secret-mock-doesnt-validate',
        scopes: ['openid', 'profile', 'email', 'groups'],
        buttonLabel: 'Sign in with mock-oauth2',
        usernameClaim: 'preferred_username',
        emailClaim: 'email',
        groupsClaim: 'groups',
        allowedGroups: ['bookkeeprr-users'],
        adminGroups: ['bookkeeprr-admins'],
        autoCreateUsers: true,
      },
    });
    expect(r.ok()).toBe(true);
    // Verify it was saved by reading back.
    const get = await page.request.get('/api/auth/oidc/config');
    expect(get.ok()).toBe(true);
    const body = (await get.json()) as { config: { issuer: string } };
    expect(body.config.issuer).toBe(OIDC_ISSUER);
  });

  test('/api/auth/oidc/test returns ok against mock-oauth2', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.post('/api/auth/oidc/test', {
      data: {
        issuer: OIDC_ISSUER,
        clientId: 'bookkeeprr-e2e',
        clientSecret: 'any',
      },
    });
    const body = (await r.json()) as Record<string, unknown>;
    if (!r.ok()) {
      throw new Error(`oidc/test returned ${r.status()}: ${JSON.stringify(body)}`);
    }
    expect(body.ok).toBe(true);
    expect(body.issuer).toEqual(expect.stringContaining('host.docker.internal'));
  });

  test('full OIDC code-flow auto-creates alice as admin', async ({ browser, page }) => {
    await signIn(page, 'admin', 'hunter22');
    // Configure + enable OIDC.
    const cfg = await page.request.patch('/api/auth/oidc/config', {
      data: {
        enabled: true,
        issuer: OIDC_ISSUER,
        clientId: 'bookkeeprr-e2e',
        clientSecret: 'any-secret',
        scopes: ['openid', 'profile', 'email', 'groups'],
        buttonLabel: 'Sign in with mock-oauth2',
        usernameClaim: 'preferred_username',
        emailClaim: 'email',
        groupsClaim: 'groups',
        allowedGroups: ['bookkeeprr-users'],
        adminGroups: ['bookkeeprr-admins'],
        autoCreateUsers: true,
      },
    });
    if (!cfg.ok()) {
      throw new Error(`oidc/config PATCH returned ${cfg.status()}: ${await cfg.text()}`);
    }
    // Fresh browser context for alice — no cookies.
    const aliceCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    // The /login page renders an OIDC form action="/api/auth/oidc/start". Submit it
    // by going to /login + clicking the OIDC button, which submits the form.
    await alicePage.goto('/login');
    // Wait briefly for the OIDC button to mount (it's fetched dynamically via /api/auth/oidc/info).
    await alicePage.waitForSelector('button:has-text("Sign in with")', { timeout: 10_000 });
    await alicePage.getByRole('button', { name: /Sign in with/i }).click();
    // The browser is redirected through mock-oauth2-server back to /api/auth/oidc/callback.
    // interactiveLogin=false means no UI; just an automatic 302 chain.
    await alicePage.waitForURL(
      (url) => url.pathname !== '/login' && !url.host.includes('mock-oauth2'),
      {
        timeout: 30_000,
      },
    );
    // Log where Alice landed for diagnostic.
    // eslint-disable-next-line no-console
    console.log('[oidc-test] alice landed on', alicePage.url());
    // Alice's auto-created user should exist in the DB.
    const list = await page.request.get('/api/users');
    expect(list.ok()).toBe(true);
    const listBody = (await list.json()) as {
      users: Array<{ username: string; role: string; authSource: string }>;
    };
    // eslint-disable-next-line no-console
    console.log(
      '[oidc-test] users:',
      listBody.users.map((u) => `${u.username}/${u.authSource}`),
    );
    const alice = listBody.users.find((u) => u.username === 'alice');
    expect(alice).toBeDefined();
    expect(alice?.role).toBe('admin');
    expect(alice?.authSource).toBe('oidc');
    await aliceCtx.close();
  });
});

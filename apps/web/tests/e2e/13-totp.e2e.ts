import { test, expect } from '@playwright/test';
import { TOTP, Secret } from 'otpauth';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn, signOut } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin@example.com', password: 'hunter22' };

// Shared across tests: the TOTP secret enrolled in test 1 is needed in tests 2 + 3.
let totpSecret: string;
// Recovery codes issued at setup — used in test 3 to verify regeneration produces different codes.
let initialRecoveryCodes: string[];

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();
});

// Tests share state: test 1 enrolls TOTP and writes the secret to a
// module-level variable; test 2 logs in and submits a code generated from
// that secret. They MUST run serially in declared order.
test.describe.serial('TOTP 2FA', () => {
  test('TOTP setup → enable persists secret', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Step 1: Call setup — returns { secret, otpauthUri, qrCodeDataUrl, recoveryCodes }.
    const setupRes = await page.request.post('/api/auth/me/totp/setup');
    expect(setupRes.ok(), await setupRes.text()).toBe(true);

    const setup = (await setupRes.json()) as {
      secret: string;
      otpauthUri: string;
      qrCodeDataUrl: string;
      recoveryCodes: string[];
    };

    expect(setup.secret).toBeTruthy();
    expect(setup.qrCodeDataUrl).toMatch(/^data:image\//);
    expect(setup.recoveryCodes).toHaveLength(10);

    totpSecret = setup.secret;
    initialRecoveryCodes = setup.recoveryCodes;

    // Step 2: Generate a live TOTP code from the returned secret.
    const code = new TOTP({
      issuer: 'bookkeeprr',
      label: ADMIN.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(setup.secret),
    }).generate();

    expect(code).toMatch(/^\d{6}$/);

    // Step 3: Enable TOTP.
    const enableRes = await page.request.post('/api/auth/me/totp/enable', {
      data: { secret: setup.secret, code, recoveryCodes: setup.recoveryCodes },
    });
    expect(enableRes.ok(), await enableRes.text()).toBe(true);
    const enableBody = (await enableRes.json()) as { ok: boolean };
    expect(enableBody.ok).toBe(true);

    // Step 4: Verify /api/auth/me now shows totpEnabledAt as non-null.
    const meRes = await page.request.get('/api/auth/me');
    expect(meRes.ok()).toBe(true);
    const me = (await meRes.json()) as { user: { totpEnabledAt: number | null } };
    expect(me.user.totpEnabledAt).not.toBeNull();
  });

  test('login challenge: TOTP-enabled user must submit TOTP code', async ({ page }) => {
    // Clear cookies to start unauthenticated.
    await signOut(page);

    // Step 1: First login step should return a TOTP challenge, not a session.
    const loginRes = await page.request.post('/api/auth/login', {
      data: { username: ADMIN.username, password: ADMIN.password },
    });
    expect(loginRes.ok(), await loginRes.text()).toBe(true);

    const loginBody = (await loginRes.json()) as {
      requiresTotp?: boolean;
      challengeToken?: string;
      user?: unknown;
    };

    // The server must gate login behind a TOTP challenge.
    expect(loginBody.requiresTotp, JSON.stringify(loginBody)).toBe(true);
    expect(loginBody.challengeToken).toBeTruthy();

    const challengeToken = loginBody.challengeToken!;

    // Step 2: Generate a fresh TOTP code from the enrolled secret.
    const code = new TOTP({
      issuer: 'bookkeeprr',
      label: ADMIN.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(totpSecret),
    }).generate();

    // Step 3: Complete the challenge.
    const totpRes = await page.request.post('/api/auth/login/totp', {
      data: { challengeToken, code },
    });
    expect(totpRes.ok(), await totpRes.text()).toBe(true);
    const totpBody = (await totpRes.json()) as { user: { username: string } };
    expect(totpBody.user.username).toBe(ADMIN.username);

    // Step 4: Session is now active — /api/auth/me should return the authenticated user.
    const meRes = await page.request.get('/api/auth/me');
    expect(meRes.ok()).toBe(true);
    const me = (await meRes.json()) as { user: { username: string } | null };
    expect(me.user).not.toBeNull();
    expect(me.user!.username).toBe(ADMIN.username);
  });

  test('TOTP recovery codes: POST /regenerate issues a fresh batch of 10 codes', async ({
    page,
  }) => {
    // TOTP is already enabled from the first test in this serial describe.
    // We must be signed in; complete the TOTP challenge to get a session.
    await signOut(page);

    const loginRes = await page.request.post('/api/auth/login', {
      data: { username: ADMIN.username, password: ADMIN.password },
    });
    expect(loginRes.ok(), await loginRes.text()).toBe(true);
    const loginBody = (await loginRes.json()) as {
      requiresTotp?: boolean;
      challengeToken?: string;
    };
    expect(loginBody.requiresTotp).toBe(true);
    const challengeToken = loginBody.challengeToken!;

    const code = new TOTP({
      issuer: 'bookkeeprr',
      label: ADMIN.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(totpSecret),
    }).generate();

    const totpRes = await page.request.post('/api/auth/login/totp', {
      data: { challengeToken, code },
    });
    expect(totpRes.ok(), await totpRes.text()).toBe(true);

    // Now regenerate recovery codes — requires password in body.
    const regenRes = await page.request.post('/api/auth/me/totp/recovery-codes/regenerate', {
      data: { password: ADMIN.password },
    });
    expect(regenRes.ok(), `regenerate failed: ${await regenRes.text()}`).toBe(true);

    const regenBody = (await regenRes.json()) as { recoveryCodes: string[] };
    expect(Array.isArray(regenBody.recoveryCodes), 'recoveryCodes should be an array').toBe(true);
    expect(regenBody.recoveryCodes).toHaveLength(10);

    // Each code should be a non-empty string.
    for (const c of regenBody.recoveryCodes) {
      expect(typeof c).toBe('string');
      expect(c.length).toBeGreaterThan(0);
    }

    // The new codes must differ from the original batch — at least one code is different.
    const newSet = new Set(regenBody.recoveryCodes);
    const overlap = initialRecoveryCodes.filter((c) => newSet.has(c));
    expect(overlap.length, 'regenerated codes should differ from the original set').toBeLessThan(
      initialRecoveryCodes.length,
    );
  });
});

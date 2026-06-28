import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn, signOut } from './helpers/auth';
import { BASE } from './helpers/api';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();
});

test.describe('Personal API key (bkr_) lifecycle', () => {
  test('POST /api/auth/me/api-keys generates a key with bkr_ prefix and prefix metadata', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.post('/api/auth/me/api-keys', {
      data: { name: 'e2e test key' },
    });
    expect(res.ok(), `POST failed: ${await res.text()}`).toBe(true);
    expect(res.status()).toBe(201);

    const body = (await res.json()) as {
      id: number;
      name: string;
      keyPrefix: string;
      plaintext: string;
    };

    expect(typeof body.id).toBe('number');
    expect(body.name).toBe('e2e test key');
    expect(typeof body.keyPrefix).toBe('string');
    expect(body.keyPrefix.length).toBeGreaterThan(0);
    expect(typeof body.plaintext).toBe('string');
    // plaintext must start with the bkr_ prefix
    expect(body.plaintext.startsWith('bkr_')).toBe(true);
    // keyPrefix must match the first 8 chars of the random part (after 'bkr_')
    const randomPart = body.plaintext.slice('bkr_'.length);
    expect(body.keyPrefix).toBe(randomPart.slice(0, 8));
  });

  test('Bearer bkr_ auth: key authenticates for user-scoped endpoints; revoked key returns 401', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Generate a personal API key while authenticated via session cookie.
    const genRes = await page.request.post('/api/auth/me/api-keys', {
      data: { name: 'bearer-auth-test' },
    });
    expect(genRes.ok(), `key generation failed: ${await genRes.text()}`).toBe(true);
    const generated = (await genRes.json()) as { id: number; plaintext: string };
    const { id: keyId, plaintext } = generated;

    // Sign out (clear session cookie) so only the Bearer token can authenticate.
    await signOut(page);

    // GET /api/auth/me/api-keys using Authorization: Bearer <plaintext>.
    // This endpoint uses authenticateRequest (step 3b handles bkr_ tokens).
    const withBearer = await fetch(`${BASE}/api/auth/me/api-keys`, {
      headers: { Authorization: `Bearer ${plaintext}` },
    });
    expect(withBearer.ok).toBe(true);
    expect(withBearer.status).toBe(200);
    const listBody = (await withBearer.json()) as {
      keys: Array<{ id: number; name: string; keyPrefix: string }>;
    };
    expect(Array.isArray(listBody.keys)).toBe(true);
    // The generated key must appear in the list.
    const found = listBody.keys.find((k) => k.id === keyId);
    expect(found, 'generated key should appear in list while valid').toBeDefined();
    expect(found!.name).toBe('bearer-auth-test');

    // Re-sign in so we can revoke the key.
    await signIn(page, ADMIN.username, ADMIN.password);
    const delRes = await page.request.delete(`/api/auth/me/api-keys/${keyId}`);
    expect(delRes.ok(), `DELETE failed: ${await delRes.text()}`).toBe(true);

    // Sign out again and confirm the revoked key no longer authenticates.
    await signOut(page);
    const afterRevoke = await fetch(`${BASE}/api/auth/me/api-keys`, {
      headers: { Authorization: `Bearer ${plaintext}` },
    });
    expect(afterRevoke.status).toBe(401);
  });

  test('DELETE /api/auth/me/api-keys/[id] revokes the key and removes it from the list', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Generate a key.
    const genRes = await page.request.post('/api/auth/me/api-keys', {
      data: { name: 'revoke-list-test' },
    });
    expect(genRes.ok(), `key generation failed: ${await genRes.text()}`).toBe(true);
    const generated = (await genRes.json()) as { id: number; plaintext: string };
    const { id: keyId } = generated;

    // List — key must be present.
    const listBefore = await page.request.get('/api/auth/me/api-keys');
    expect(listBefore.ok(), `list GET failed: ${await listBefore.text()}`).toBe(true);
    const beforeBody = (await listBefore.json()) as {
      keys: Array<{ id: number; name: string }>;
    };
    expect(beforeBody.keys.some((k) => k.id === keyId)).toBe(true);

    // DELETE the key.
    const delRes = await page.request.delete(`/api/auth/me/api-keys/${keyId}`);
    expect(delRes.ok(), `DELETE failed: ${await delRes.text()}`).toBe(true);
    const delBody = (await delRes.json()) as { ok: boolean };
    expect(delBody.ok).toBe(true);

    // List again — key must be absent.
    const listAfter = await page.request.get('/api/auth/me/api-keys');
    expect(listAfter.ok(), `list GET after delete failed: ${await listAfter.text()}`).toBe(true);
    const afterBody = (await listAfter.json()) as {
      keys: Array<{ id: number }>;
    };
    expect(afterBody.keys.some((k) => k.id === keyId)).toBe(false);

    // A second DELETE on the same id must return 404.
    const delAgain = await page.request.delete(`/api/auth/me/api-keys/${keyId}`);
    expect(delAgain.status()).toBe(404);
  });
});

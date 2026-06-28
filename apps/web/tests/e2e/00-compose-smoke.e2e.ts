import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';

test.describe.configure({ timeout: 120_000 });
test.beforeAll(async () => {
  composeDownUp();
});

test.describe('Compose smoke', () => {
  test('bookkeeprr /api/health answers healthy', async ({ request }) => {
    const r = await request.get('/api/health');
    expect(r.ok()).toBe(true);
    const body = (await r.json()) as { status: string };
    expect(body.status).toBe('healthy');
  });

  test('caddy reverse-proxies to bookkeeprr', async ({ request }) => {
    const r = await request.get('http://localhost:18081/api/health');
    expect(r.ok()).toBe(true);
  });

  test('mock-oauth2-server discovery doc reachable', async ({ request }) => {
    const r = await request.get(
      'http://localhost:18080/bookkeeprr/.well-known/openid-configuration',
    );
    expect(r.ok()).toBe(true);
  });
});

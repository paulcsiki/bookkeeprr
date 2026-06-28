import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.BOOKKEEPRR_E2E_PORT ?? 13000);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Map host.docker.internal:18080 → 127.0.0.1:18080 in chrome so the
        // OIDC code-flow's IdP redirect lands on the host-side port. The
        // bookkeeprr container reaches the same URL via the host-gateway
        // extra_hosts mapping in docker-compose.e2e.yml.
        launchOptions: {
          args: ['--host-resolver-rules=MAP host.docker.internal:18080 127.0.0.1:18080'],
        },
      },
    },
  ],
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});

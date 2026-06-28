import { installFetchMock } from '@/lib/e2e-fetch-mock';

const originalFetch = globalThis.fetch;

beforeAll(() => {
  installFetchMock();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('e2e-fetch-mock push extensions', () => {
  // Note: `EXPO_PUBLIC_MOBILE_E2E_PUSH_ENABLED` is inlined by
  // babel-plugin-transform-inline-environment-variables at module-compile time,
  // so the "true" branch can't be flipped at Jest runtime — that flow is
  // covered by the Maestro suite, which sets the env var before Metro starts.

  it('handshake advertises push_enabled=false when env var unset', async () => {
    const res = await fetch('https://srv/api/mobile/handshake');
    const body = (await res.json()) as { push_enabled: boolean };
    expect(body.push_enabled).toBe(false);
  });

  it('handshake response shape includes push_enabled key', async () => {
    const res = await fetch('https://srv/api/mobile/handshake');
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(body, 'push_enabled')).toBe(true);
  });

  it('POST /api/mobile/push/register returns 201 with id and registered_at', async () => {
    const res = await fetch('https://srv/api/mobile/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake' },
      body: JSON.stringify({ device_token: 'fcm-token-abc', platform: 'android' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; registered_at: string };
    expect(body.id).toMatch(/^[0-9a-z-]+$/);
    expect(typeof body.registered_at).toBe('string');
    expect(body.registered_at.length).toBeGreaterThan(0);
  });
});

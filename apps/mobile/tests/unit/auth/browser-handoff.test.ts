import { exchangeCode } from '@/auth/browser-handoff';

beforeEach(() => {
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
});

it('exchangeCode posts and returns credentials envelope', async () => {
  (fetch as unknown as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ token: 't', refresh_token: 'r', expires_at: '2026-08-25T00:00:00Z' }),
  });
  const r = await exchangeCode('https://srv', 'abc123', null);
  expect(r).toEqual({
    serverUrl: 'https://srv',
    token: 't',
    refreshToken: 'r',
    expiresAt: '2026-08-25T00:00:00Z',
    certFingerprint: null,
  });
});

it('throws on bad response', async () => {
  (fetch as unknown as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({ error: 'no' }),
  });
  await expect(exchangeCode('https://srv', 'abc', null)).rejects.toThrow();
});

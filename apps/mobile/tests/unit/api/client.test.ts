import { createApiClient, ApiError } from '@/api/client';

const goodCreds = {
  serverUrl: 'https://srv',
  token: 'tok',
  refreshToken: 'r',
  expiresAt: '2026-08-25T00:00:00Z',
  certFingerprint: null,
};

describe('apiClient', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  it('attaches Authorization Bearer', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ping: 'pong' }),
    });
    const c = createApiClient(goodCreds);
    await c.get('/api/ping');
    const call = (fetch as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((call[1].headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws ApiError on non-2xx', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });
    const c = createApiClient(goodCreds);
    await expect(c.get('/api/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('emits onAuthFail on 401', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const onAuthFail = jest.fn();
    const c = createApiClient(goodCreds, { onAuthFail });
    await expect(c.get('/api/x')).rejects.toBeInstanceOf(ApiError);
    expect(onAuthFail).toHaveBeenCalled();
  });

  it('does NOT emit onAuthFail on 403 (authorized-but-not-allowed, not a sign-out)', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    const onAuthFail = jest.fn();
    const c = createApiClient(goodCreds, { onAuthFail });
    await expect(c.get('/api/x')).rejects.toBeInstanceOf(ApiError);
    expect(onAuthFail).not.toHaveBeenCalled();
  });

  it('does not emit onAuthFail on 500', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const onAuthFail = jest.fn();
    const c = createApiClient(goodCreds, { onAuthFail });
    await expect(c.get('/api/x')).rejects.toBeInstanceOf(ApiError);
    expect(onAuthFail).not.toHaveBeenCalled();
  });

  it('resolves URL against serverUrl', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const c = createApiClient(goodCreds);
    await c.get('/api/mobile/version');
    const call = (fetch as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe('https://srv/api/mobile/version');
  });
});

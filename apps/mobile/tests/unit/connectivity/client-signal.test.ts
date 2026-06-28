import { createApiClient } from '@/api/client';
import { useConnectivity } from '@/state/connectivityStore';

const goodCreds = {
  serverUrl: 'https://srv',
  token: 'tok',
  refreshToken: 'r',
  expiresAt: '2026-08-25T00:00:00Z',
  certFingerprint: null,
};

describe('apiClient → connectivity signal', () => {
  beforeEach(() => {
    useConnectivity.setState({ deviceOnline: true, serverReachable: null, lastPingAt: 0 });
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  it('Case A: a 200 response marks the server reachable', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const c = createApiClient(goodCreds);
    await c.get('/api/ping');
    expect(useConnectivity.getState().serverReachable).toBe(true);
  });

  it('Case B: a 500 response (HTTP error WITH a body) still marks reachable', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce(
      new Response('{"error":"x"}', { status: 500 }),
    );
    const c = createApiClient(goodCreds);
    try {
      await c.get('/api/x');
    } catch {
      /* ApiError expected — bytes came back, so still reachable */
    }
    expect(useConnectivity.getState().serverReachable).toBe(true);
  });

  it('Case C: a network failure (no response) marks the server NOT reachable', async () => {
    (fetch as unknown as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
    const c = createApiClient(goodCreds);
    try {
      await c.get('/api/x');
    } catch {
      /* network error rethrown */
    }
    expect(useConnectivity.getState().serverReachable).toBe(false);
  });
});

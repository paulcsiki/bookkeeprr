import { handshake, fetchVersion } from '@/api/anon-client';

beforeEach(() => {
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
});

it('handshake returns parsed response', async () => {
  (fetch as unknown as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      server_version: '0.1.0',
      supported_auth_modes: ['password'],
      brand: 'bookkeeprr',
    }),
  });
  const r = await handshake('https://srv');
  expect(r.server_version).toBe('0.1.0');
});

it('handshake rejects when shape is wrong', async () => {
  (fetch as unknown as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ wrong: true }),
  });
  await expect(handshake('https://srv')).rejects.toThrow();
});

it('fetchVersion returns parsed response', async () => {
  (fetch as unknown as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ current: '0.2.0', min_supported: '0.1.0' }),
  });
  const v = await fetchVersion('https://srv');
  expect(v.current).toBe('0.2.0');
});

import * as SecureStore from '@/lib/secure-storage';
import { tokenStore } from '@/auth/token-store';

describe('tokenStore', () => {
  beforeEach(() => jest.clearAllMocks());

  it('save persists a credentials envelope', async () => {
    await tokenStore.save({
      serverUrl: 'https://x',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2026-08-25T00:00:00Z',
      certFingerprint: null,
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    const call = (SecureStore.setItemAsync as jest.Mock).mock.calls[0] as [string, string];
    const [key, value] = call;
    expect(key).toBe('bookkeeprr.creds.v1');
    expect(JSON.parse(value).token).toBe('t');
  });

  it('load returns null when nothing stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    expect(await tokenStore.load()).toBeNull();
  });

  it('load returns parsed credentials when present', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        serverUrl: 'https://x',
        token: 't',
        refreshToken: 'r',
        expiresAt: '2026-08-25T00:00:00Z',
        certFingerprint: null,
      }),
    );
    const c = await tokenStore.load();
    expect(c?.token).toBe('t');
  });

  it('clear deletes the entry', async () => {
    await tokenStore.clear();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('bookkeeprr.creds.v1');
  });
});

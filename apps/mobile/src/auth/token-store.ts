import * as SecureStore from '@/lib/secure-storage';

const KEY = 'bookkeeprr.creds.v1';

export interface Credentials {
  serverUrl: string;
  token: string;
  refreshToken: string;
  expiresAt: string;
  certFingerprint: string | null;
}

export const tokenStore = {
  async save(c: Credentials): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(c));
  },
  async load(): Promise<Credentials | null> {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Credentials;
    } catch {
      return null;
    }
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
  },
};

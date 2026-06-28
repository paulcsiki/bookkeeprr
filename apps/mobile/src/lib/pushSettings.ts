// AsyncStorage-backed DAL for the local push opt-in state.
//
// The handshake's `push_enabled` flag tells us whether the server supports
// cloud-relayed pushes; this module remembers whether the *user* has opted
// in on this device, and stores the FCM/APNs token returned by the
// `/api/mobile/push/register` call so the UI can show the registered state
// across cold starts (and so PushService can refresh/delete it later).
//
// Schema is versioned via the storage key suffix (`/v1`). If the persisted
// blob fails to parse for any reason we fall back to defaults — push
// settings are advisory state, never a source of truth, so it's safe to
// drop a corrupted value silently.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'push-settings/v1';

export type PushSettings = {
  userOptedIn: boolean;
  registeredToken: string | null;
};

const DEFAULTS: PushSettings = { userOptedIn: false, registeredToken: null };

export const pushSettings = {
  async get(): Promise<PushSettings> {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return { ...DEFAULTS };
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS };
      const obj = parsed as Record<string, unknown>;
      return {
        userOptedIn: typeof obj.userOptedIn === 'boolean' ? obj.userOptedIn : false,
        registeredToken: typeof obj.registeredToken === 'string' ? obj.registeredToken : null,
      };
    } catch {
      return { ...DEFAULTS };
    }
  },
  async setEnabled(enabled: boolean, token: string | null = null): Promise<void> {
    const next: PushSettings = enabled
      ? { userOptedIn: true, registeredToken: token }
      : { userOptedIn: false, registeredToken: null };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  },
};

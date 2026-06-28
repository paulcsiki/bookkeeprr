// `PushService` owns the rn-firebase messaging lifecycle on behalf of the UI.
//
// Responsibilities:
//   * `enable()` — request the OS notification permission, fetch the FCM/APNs
//     device token, POST it to the server's `/api/mobile/push/register`
//     endpoint, and persist the local opt-in flag via `pushSettings`.
//   * `disable()` — best-effort deletion of the device token and clearing of
//     the local opt-in flag.
//   * `refreshToken()` — re-register the current token when the user is
//     already opted-in (e.g. on app launch or when rn-firebase emits a token
//     rotation event).
//
// All side-effects funnel through `pushSettings` and `fetch`/messaging — the
// service holds no module-level state, so multiple instances are safe.

import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { pushSettings } from '@/lib/pushSettings';

export type EnableResult =
  | { kind: 'ok'; deviceId: string }
  | { kind: 'permission_denied' }
  | { kind: 'token_error'; reason: string }
  | { kind: 'server_error'; status?: number };

export type RefreshResult = EnableResult | { kind: 'not_enabled' };

export interface PushServiceOptions {
  serverUrl: string;
  accessToken: string;
  // When true, skip `messaging().requestPermission()` and treat the user as
  // having granted permission. Used exclusively by Maestro e2e flows so the
  // native permission dialog (which Maestro can't drive) doesn't block the
  // flow. Defaults to the babel-inlined value of
  // `EXPO_PUBLIC_MOBILE_E2E_PUSH_AUTOGRANT`, which is `'1'` only in dedicated
  // e2e bundles. Unit tests pass this explicitly because babel-inlined env
  // vars cannot be flipped at runtime.
  e2eAutogrant?: boolean;
}

interface RegisterResponse {
  id: string;
  registered_at?: string;
}

function platformLabel(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

async function registerWithServer(opts: PushServiceOptions, token: string): Promise<EnableResult> {
  const url = `${opts.serverUrl.replace(/\/$/, '')}/api/mobile/push/register`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${opts.accessToken}`,
      },
      body: JSON.stringify({ device_token: token, platform: platformLabel() }),
    });
  } catch {
    return { kind: 'server_error' };
  }
  if (!res.ok) return { kind: 'server_error', status: res.status };
  let body: RegisterResponse;
  try {
    body = (await res.json()) as RegisterResponse;
  } catch {
    return { kind: 'server_error', status: res.status };
  }
  await pushSettings.setEnabled(true, token);
  return { kind: 'ok', deviceId: body.id };
}

const E2E_AUTOGRANT_DEFAULT = process.env.EXPO_PUBLIC_MOBILE_E2E_PUSH_AUTOGRANT === '1';

export class PushService {
  private readonly e2eAutogrant: boolean;

  constructor(private readonly opts: PushServiceOptions) {
    this.e2eAutogrant = opts.e2eAutogrant ?? E2E_AUTOGRANT_DEFAULT;
  }

  async enable(): Promise<EnableResult> {
    const m = messaging();
    const { AUTHORIZED, PROVISIONAL } = messaging.AuthorizationStatus;
    let authStatus: number;
    if (this.e2eAutogrant) {
      authStatus = AUTHORIZED;
    } else {
      try {
        authStatus = await m.requestPermission();
      } catch {
        return { kind: 'permission_denied' };
      }
    }
    if (authStatus !== AUTHORIZED && authStatus !== PROVISIONAL) {
      return { kind: 'permission_denied' };
    }

    let token: string;
    if (this.e2eAutogrant) {
      // Stub `getToken()` in e2e mode too — the dev build uses a placeholder
      // `google-services.json` (no real Firebase project), so the native call
      // throws `messaging/unknown: Please set a valid API key`.
      token = 'e2e-fcm-token';
    } else {
      try {
        token = await m.getToken();
      } catch (err) {
        return {
          kind: 'token_error',
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return registerWithServer(this.opts, token);
  }

  async disable(): Promise<void> {
    try {
      await messaging().deleteToken();
    } catch {
      // best-effort — even if delete fails, clear local state so the UI
      // reflects the user's intent.
    }
    await pushSettings.setEnabled(false);
  }

  async refreshToken(): Promise<RefreshResult> {
    const current = await pushSettings.get();
    if (!current.userOptedIn) return { kind: 'not_enabled' };
    let token: string;
    try {
      token = await messaging().getToken();
    } catch (err) {
      return {
        kind: 'token_error',
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    return registerWithServer(this.opts, token);
  }
}

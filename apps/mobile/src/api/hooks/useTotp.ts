/**
 * Hooks for TOTP 2FA management from the mobile app.
 * All mutations are fire-and-forget with explicit loading/error state.
 */

import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';

type TotpSetupResponse = {
  secret: string;
  otpauthUri: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
};

type TotpEnableBody = {
  secret: string;
  code: string;
  recoveryCodes: string[];
};

type RegenerateResponse = {
  recoveryCodes: string[];
};

export function useTotpActions() {
  const { state, signOut } = useAuth();

  function getClient() {
    if (state.status !== 'authenticated') throw new Error('Not authenticated');
    return createApiClient(state.creds, { onAuthFail: () => signOut() });
  }

  async function setup(): Promise<TotpSetupResponse> {
    const client = getClient();
    return client.post<TotpSetupResponse>('/api/auth/me/totp/setup', {});
  }

  async function enable(body: TotpEnableBody): Promise<void> {
    const client = getClient();
    await client.post('/api/auth/me/totp/enable', body);
  }

  async function disable(password: string): Promise<void> {
    if (state.status !== 'authenticated') throw new Error('Not authenticated');
    const url = `${state.creds.serverUrl.replace(/\/$/, '')}/api/auth/me/totp`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.creds.token}`,
      },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      throw new ApiError(res.status, body, body.message ?? `DELETE /api/auth/me/totp failed: ${res.status}`);
    }
  }

  async function regenerateCodes(password: string): Promise<RegenerateResponse> {
    const client = getClient();
    return client.post<RegenerateResponse>('/api/auth/me/totp/recovery-codes/regenerate', {
      password,
    });
  }

  return { setup, enable, disable, regenerateCodes };
}

export { ApiError };

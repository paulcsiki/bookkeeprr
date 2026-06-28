import { ExchangeResponse } from '@/api/schemas';
import type { Credentials } from './token-store';

export function buildLoginUrl(serverUrl: string): string {
  const base = serverUrl.replace(/\/$/, '');
  const returnTo = encodeURIComponent('bookkeeprr://auth/callback');
  return `${base}/login?return_to=${returnTo}`;
}

export async function exchangeCode(
  serverUrl: string,
  code: string,
  certFingerprint: string | null,
): Promise<Credentials> {
  const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/mobile/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ exchange_code: code }),
  });
  const raw = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`exchange failed: ${res.status}`);
  const parsed = ExchangeResponse.parse(raw);
  return {
    serverUrl,
    token: parsed.token,
    refreshToken: parsed.refresh_token,
    expiresAt: parsed.expires_at,
    certFingerprint,
  };
}

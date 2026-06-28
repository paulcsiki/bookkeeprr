import { createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { defineSetting } from '@/server/db/settings';

const OidcPendingPayloadSchema = z.object({
  codeVerifier: z.string().min(1),
  state: z.string().min(1),
  nonce: z.string().min(1),
  issuer: z.string().min(1),
  next: z.string().nullable().optional(),
  returnTo: z.string().nullable().optional(),
});

export type OidcPendingPayload = z.infer<typeof OidcPendingPayloadSchema>;

const oidcCookieSecretSetting = defineSetting(
  'oidc-cookie-secret',
  z.object({ secret: z.string() }),
  { secret: '' },
);

async function getOrCreateSecret(): Promise<string> {
  const current = await oidcCookieSecretSetting.get();
  if (current.secret.length > 0) return current.secret;
  const generated = randomBytes(32).toString('base64url');
  await oidcCookieSecretSetting.set({ secret: generated });
  return generated;
}

function hmac(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

export async function signOidcPendingCookie(payload: OidcPendingPayload): Promise<string> {
  const secret = await getOrCreateSecret();
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, 'utf8').toString('base64url');
  const sig = hmac(secret, body);
  return `${body}.${sig}`;
}

export async function parseOidcPendingCookie(raw: string): Promise<OidcPendingPayload | null> {
  if (raw.length === 0 || !raw.includes('.')) return null;
  const [body, sig] = raw.split('.', 2);
  if (body === undefined || sig === undefined) return null;
  const secret = await getOrCreateSecret();
  const expected = hmac(secret, body);
  if (expected !== sig) return null;
  try {
    const json = Buffer.from(body, 'base64url').toString('utf8');
    const parsed = OidcPendingPayloadSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function buildOidcPendingSetCookie(value: string): string {
  // 10-minute TTL; HttpOnly; SameSite=Lax (the IdP redirect comes back via a top-level navigation);
  // path scoped to /api/auth/oidc so it isn't echoed on every request.
  const maxAge = 10 * 60;
  return `bookkeeprr_oidc_pending=${value}; Path=/api/auth/oidc; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function buildOidcPendingClearCookie(): string {
  return 'bookkeeprr_oidc_pending=; Path=/api/auth/oidc; HttpOnly; SameSite=Lax; Max-Age=0';
}

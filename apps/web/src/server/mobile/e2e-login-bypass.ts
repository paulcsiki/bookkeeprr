import { getUserByUsername, listUsers } from '@/server/db/users';

/**
 * E2E login bypass — STRICTLY env-gated and OFF unless
 * `BOOKKEEPRR_E2E_LOGIN_BYPASS=1` is set in the server environment.
 *
 * Mobile Maestro flows that exercise a *real* bookkeeprr server can't drive
 * the interactive in-app-browser login. When this gate is enabled the mobile
 * client (see `AuthHandoff` + `EXPO_PUBLIC_MOBILE_E2E_AUTOAUTH`) posts a fixed
 * exchange code, and `/api/mobile/exchange` trades it for a real bearer token
 * bound to a seeded user — no browser, no real OAuth round-trip.
 *
 * SECURITY: this MUST never be enabled in production. The gate defaults to
 * disabled, there is no UI to turn it on, and the only way to flip it is an
 * explicit server-side env var that CI sets for the e2e job alone.
 */
export function isE2eLoginBypassEnabled(): boolean {
  return process.env.BOOKKEEPRR_E2E_LOGIN_BYPASS === '1';
}

/**
 * The fixed exchange code the bypass accepts. Defaults to the constant baked
 * into the mobile AUTOAUTH branch (`AuthHandoff`); override with
 * `BOOKKEEPRR_E2E_LOGIN_CODE` if a flow needs a different value.
 */
export function e2eBypassCode(): string {
  return process.env.BOOKKEEPRR_E2E_LOGIN_CODE || 'e2e-bypass-code';
}

/**
 * Resolve which user the bypass authenticates as. Prefers
 * `BOOKKEEPRR_E2E_LOGIN_USERNAME` (matching the seed script); otherwise falls
 * back to the first user in the table (the seeded admin). Returns `null` when
 * no matching user exists, so the caller still emits a 401.
 */
export async function resolveE2eBypassUserId(): Promise<number | null> {
  const username = process.env.BOOKKEEPRR_E2E_LOGIN_USERNAME;
  if (username) {
    const user = await getUserByUsername(username);
    return user?.id ?? null;
  }
  const all = await listUsers();
  return all[0]?.id ?? null;
}

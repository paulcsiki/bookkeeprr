const SESSION_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export function buildSessionCookieHeader(token: string): string {
  return `bookkeeprr_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE_S}`;
}

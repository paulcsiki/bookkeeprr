import { cookies } from 'next/headers';
import { getSessionByToken } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';

/**
 * Resolve the currently logged-in user (by `bookkeeprr_session` cookie) to a
 * minimal actor descriptor for server-page authorization checks.
 *
 * Returns `null` when:
 * - no session cookie is set,
 * - the session is unknown or expired,
 * - the user no longer exists, or
 * - the user is disabled.
 *
 * Pages should treat a `null` return as "redirect to /login".
 */
export async function getActor(): Promise<{ userId: number; role: 'admin' | 'user' } | null> {
  const c = await cookies();
  const token = c.get('bookkeeprr_session')?.value ?? null;
  if (token === null) return null;
  const s = await getSessionByToken(token);
  if (s === null || s.expiresAt <= new Date()) return null;
  const u = await getUser(s.userId);
  if (u === null || u.disabled) return null;
  return { userId: u.id, role: u.role };
}

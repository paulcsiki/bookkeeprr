import type { NextRequest } from 'next/server';
import { authenticateRequest } from '@/server/auth/session-middleware';

/**
 * Resolve the human user id for a request, or null.
 *
 * Returns null for the 'system' actor (X-Api-Key) and for unauthenticated
 * requests. Use on routes that must be scoped to a real, logged-in human
 * (e.g. reader progress, bookmarks) rather than service callers.
 */
export async function requireUserId(req: NextRequest): Promise<number | null> {
  const r = await authenticateRequest(req);
  if (r.kind !== 'authenticated' || r.actor === 'system') return null;
  return r.actor.userId;
}

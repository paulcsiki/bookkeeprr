import { getUser } from '@/server/db/users';
import type { UserRow } from '@/server/db/schema';
import { validateBearerToken } from '@/server/mobile/tokens';

export type BearerAuthResult =
  | { kind: 'authenticated'; user: UserRow }
  | { kind: 'no_token' }
  | { kind: 'invalid_token' };

const BEARER_PREFIX = 'bearer ';

function extractBearerToken(header: string | null): string | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed.length < BEARER_PREFIX.length) return null;
  if (trimmed.slice(0, BEARER_PREFIX.length).toLowerCase() !== BEARER_PREFIX) {
    return null;
  }
  const token = trimmed.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve a mobile bearer token from the Authorization header. Returns:
 *
 * - `{ kind: 'no_token' }` when the header is missing or non-bearer.
 * - `{ kind: 'invalid_token' }` when the token is unknown, expired, or
 *   the owning user has been disabled / deleted.
 * - `{ kind: 'authenticated', user }` on success.
 */
export async function authenticateBearer(req: Request): Promise<BearerAuthResult> {
  const token = extractBearerToken(req.headers.get('authorization'));
  if (token === null) return { kind: 'no_token' };
  const userId = await validateBearerToken(token);
  if (userId === null) return { kind: 'invalid_token' };
  const user = await getUser(userId);
  if (user === null || user.disabled) return { kind: 'invalid_token' };
  return { kind: 'authenticated', user };
}

/** Returns true when the request carries an `Authorization: Bearer …` header. */
export function hasBearerHeader(req: Request): boolean {
  return extractBearerToken(req.headers.get('authorization')) !== null;
}

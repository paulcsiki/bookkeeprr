import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from './client';
import { personalApiKeys } from './schema';
import { withWriteLock } from './write-lock';

const KEY_PREFIX = 'bkr_';
const KEY_BYTES = 32;
const PREFIX_DISPLAY_LEN = 8; // first 8 chars of the random part

export type ApiKeyListItem = {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type ApiKeyGenerated = {
  id: number;
  name: string;
  keyPrefix: string;
  plaintext: string;
};

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function buildPlaintext(): string {
  return KEY_PREFIX + randomBytes(KEY_BYTES).toString('base64url');
}

export async function generateApiKey(userId: number, name: string): Promise<ApiKeyGenerated> {
  const plaintext = buildPlaintext();
  const random = plaintext.slice(KEY_PREFIX.length); // base64url portion
  const keyPrefix = random.slice(0, PREFIX_DISPLAY_LEN);
  const keyHash = hashKey(plaintext);

  const [row] = await withWriteLock(() =>
    getDb()
      .insert(personalApiKeys)
      .values({ userId, name, keyHash, keyPrefix })
      .returning(),
  );
  if (!row) throw new Error('generateApiKey: insert returned no row');

  return { id: row.id, name: row.name, keyPrefix: row.keyPrefix, plaintext };
}

export async function listApiKeysForUser(userId: number): Promise<ApiKeyListItem[]> {
  const rows = await getDb()
    .select({
      id: personalApiKeys.id,
      name: personalApiKeys.name,
      keyPrefix: personalApiKeys.keyPrefix,
      createdAt: personalApiKeys.createdAt,
      lastUsedAt: personalApiKeys.lastUsedAt,
    })
    .from(personalApiKeys)
    .where(eq(personalApiKeys.userId, userId))
    .orderBy(desc(personalApiKeys.createdAt));
  return rows;
}

export async function revokeApiKey(
  userId: number,
  id: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rows = await getDb()
    .select({ id: personalApiKeys.id })
    .from(personalApiKeys)
    .where(and(eq(personalApiKeys.id, id), eq(personalApiKeys.userId, userId)))
    .limit(1);
  if (rows.length === 0) return { ok: false, reason: 'not_found' };

  await withWriteLock(() =>
    getDb()
      .delete(personalApiKeys)
      .where(and(eq(personalApiKeys.id, id), eq(personalApiKeys.userId, userId))),
  );
  return { ok: true };
}

export async function findUserByBearer(
  bearer: string,
): Promise<{ userId: number; keyId: number } | null> {
  if (!bearer.startsWith(KEY_PREFIX)) return null;
  const keyHash = hashKey(bearer);
  const rows = await getDb()
    .select({ userId: personalApiKeys.userId, keyId: personalApiKeys.id })
    .from(personalApiKeys)
    .where(eq(personalApiKeys.keyHash, keyHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function markApiKeyUsed(keyId: number): Promise<void> {
  // Fire-and-forget — caller should not await.
  await getDb()
    .update(personalApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(personalApiKeys.id, keyId));
}

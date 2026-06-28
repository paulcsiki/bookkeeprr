import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import {
  generateApiKey,
  listApiKeysForUser,
  revokeApiKey,
  findUserByBearer,
  markApiKeyUsed,
} from '@/server/db/api-keys';
import { authenticateRequest } from '@/server/auth/session-middleware';

async function makeUser(username = 'apikey-user'): Promise<number> {
  const u = await insertUser({
    username,
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  return u.id;
}

function mkNextReq(headers: Record<string, string> = {}): NextRequest {
  const req = new Request('http://localhost/api/something', { headers }) as unknown as NextRequest;
  Object.defineProperty(req, 'cookies', {
    value: { get: (_name: string) => undefined },
    configurable: true,
  });
  return req;
}

describe('generateApiKey', () => {
  let h: SeedHandle;
  beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
  afterEach(() => h.cleanup());

  it('returns a plaintext key with bkr_ prefix', async () => {
    const userId = await makeUser();
    const result = await generateApiKey(userId, 'my key');
    expect(result.plaintext).toMatch(/^bkr_/);
    expect(result.name).toBe('my key');
    expect(result.keyPrefix).toHaveLength(8);
  });

  it('stores a different hash than the plaintext', async () => {
    const userId = await makeUser();
    const result = await generateApiKey(userId, 'test');
    // The prefix is stored, not the full key
    expect(result.plaintext).not.toBe(result.keyPrefix);
    expect(result.plaintext.length).toBeGreaterThan(8);
  });
});

describe('listApiKeysForUser', () => {
  let h: SeedHandle;
  beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
  afterEach(() => h.cleanup());

  it('returns empty array when no keys exist', async () => {
    const userId = await makeUser();
    const keys = await listApiKeysForUser(userId);
    expect(keys).toHaveLength(0);
  });

  it('returns all keys for the user', async () => {
    const userId = await makeUser();
    await generateApiKey(userId, 'first');
    await generateApiKey(userId, 'second');
    const keys = await listApiKeysForUser(userId);
    expect(keys).toHaveLength(2);
    const names = keys.map((k) => k.name).sort();
    expect(names).toEqual(['first', 'second']);
  });

  it('does not return keys belonging to other users', async () => {
    const userId1 = await makeUser('user-a');
    const userId2 = await makeUser('user-b');
    await generateApiKey(userId1, 'user-a-key');
    const keys = await listApiKeysForUser(userId2);
    expect(keys).toHaveLength(0);
  });
});

describe('revokeApiKey', () => {
  let h: SeedHandle;
  beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
  afterEach(() => h.cleanup());

  it('revokes an existing key', async () => {
    const userId = await makeUser();
    const { id } = await generateApiKey(userId, 'to-revoke');
    const result = await revokeApiKey(userId, id);
    expect(result.ok).toBe(true);
    const keys = await listApiKeysForUser(userId);
    expect(keys).toHaveLength(0);
  });

  it('returns not_found when key does not exist', async () => {
    const userId = await makeUser();
    const result = await revokeApiKey(userId, 99999);
    expect(result.ok).toBe(false);
  });

  it('cannot revoke another user\'s key', async () => {
    const userId1 = await makeUser('owner');
    const userId2 = await makeUser('attacker');
    const { id } = await generateApiKey(userId1, 'owned');
    const result = await revokeApiKey(userId2, id);
    expect(result.ok).toBe(false);
    // Key still exists for owner
    const keys = await listApiKeysForUser(userId1);
    expect(keys).toHaveLength(1);
  });
});

describe('findUserByBearer', () => {
  let h: SeedHandle;
  beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
  afterEach(() => h.cleanup());

  it('returns null for an unknown key', async () => {
    const result = await findUserByBearer('bkr_notreal');
    expect(result).toBeNull();
  });

  it('returns null for a string without bkr_ prefix', async () => {
    const result = await findUserByBearer('some-random-string');
    expect(result).toBeNull();
  });

  it('finds the user for a valid key', async () => {
    const userId = await makeUser();
    const { plaintext } = await generateApiKey(userId, 'valid');
    const result = await findUserByBearer(plaintext);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(userId);
  });
});

describe('markApiKeyUsed', () => {
  let h: SeedHandle;
  beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
  afterEach(() => h.cleanup());

  it('updates lastUsedAt on the key', async () => {
    const userId = await makeUser();
    const { id } = await generateApiKey(userId, 'used');
    const before = await listApiKeysForUser(userId);
    expect(before[0]!.lastUsedAt).toBeNull();
    await markApiKeyUsed(id);
    const after = await listApiKeysForUser(userId);
    expect(after[0]!.lastUsedAt).toBeInstanceOf(Date);
  });
});

describe('authenticateRequest with personal API key', () => {
  let h: SeedHandle;
  beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
  afterEach(() => h.cleanup());

  it('authenticates a valid bkr_ bearer token', async () => {
    const userId = await makeUser('bkr-user');
    const { plaintext } = await generateApiKey(userId, 'test-key');
    const r = await authenticateRequest(mkNextReq({ authorization: `Bearer ${plaintext}` }));
    expect(r.kind).toBe('authenticated');
    if (r.kind !== 'authenticated' || r.actor === 'system') throw new Error('unexpected');
    expect(r.actor.userId).toBe(userId);
  });

  it('falls through to unauthenticated for an invalid bkr_ token', async () => {
    await makeUser();
    const r = await authenticateRequest(mkNextReq({ authorization: 'Bearer bkr_notvalid' }));
    expect(r.kind).toBe('unauthenticated');
  });
});

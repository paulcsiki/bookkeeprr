import { hash, verify } from '@node-rs/argon2';

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, {
    algorithm: 2, // Algorithm.Argon2id
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
    outputLen: 32,
  });
}

export async function verifyPassword(plain: string, hashStr: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain);
  } catch {
    return false;
  }
}

export function validatePasswordPolicy(
  plain: string,
): { ok: true } | { ok: false; reason: string } {
  if (typeof plain !== 'string') return { ok: false, reason: 'password required' };
  if (plain.length < 8) return { ok: false, reason: 'password must be at least 8 characters' };
  return { ok: true };
}

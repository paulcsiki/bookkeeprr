import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { exportJWK, type JWK } from 'jose';

export interface Keypair {
  publicJwk: JWK;
  privateJwk: JWK;
  kid: string;
  createdAt: string;
}

const FILENAME = 'cloud_keypair.json';

function thumbprintHex(jwk: JWK): string {
  // Minimal JWK thumbprint per RFC 7638 for OKP keys.
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

async function generateKeypair(): Promise<Keypair> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  const kid = thumbprintHex(publicJwk);
  publicJwk.kid = kid;
  privateJwk.kid = kid;
  return {
    publicJwk,
    privateJwk,
    kid,
    createdAt: new Date().toISOString(),
  };
}

export async function loadOrCreateKeypair(configDir: string): Promise<Keypair> {
  const path = join(configDir, FILENAME);
  try {
    const raw = await fs.readFile(path, 'utf-8');
    return JSON.parse(raw) as Keypair;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const kp = await generateKeypair();
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path, JSON.stringify(kp, null, 2), { mode: 0o600 });
  return kp;
}

export async function rotateKeypair(configDir: string): Promise<Keypair> {
  const path = join(configDir, FILENAME);
  const kp = await generateKeypair();
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path, JSON.stringify(kp, null, 2), { mode: 0o600 });
  return kp;
}

/**
 * Rotate the keypair atomically, preserving the previous keypair as a `.prev`
 * sibling file. The rotation flow:
 *
 *  1. Read the current (old) keypair from disk.
 *  2. Generate a fresh (new) keypair.
 *  3. Move `cloud_keypair.json` -> `cloud_keypair.json.prev`.
 *  4. Write the new keypair to `cloud_keypair.json`.
 *
 * If the caller subsequently confirms the rotation succeeded with the cloud,
 * they should call {@link commitRotation} to delete the `.prev` backup.
 * If the cloud rejects the rotation, the caller should call
 * {@link revertRotation} to restore the previous keypair from `.prev`.
 */
export async function rotateKeypairWithBackup(
  configDir: string,
): Promise<{ oldKeypair: Keypair; newKeypair: Keypair }> {
  const path = join(configDir, FILENAME);
  const prevPath = join(configDir, `${FILENAME}.prev`);
  await fs.mkdir(configDir, { recursive: true });

  const oldKeypair = await loadOrCreateKeypair(configDir);
  const newKeypair = await generateKeypair();

  // Move the old keypair file to .prev (clobber any stale .prev from a prior
  // failed rotation — only one rollback level is supported).
  await fs.rename(path, prevPath);

  try {
    await fs.writeFile(path, JSON.stringify(newKeypair, null, 2), { mode: 0o600 });
  } catch (err) {
    // Restore the old keypair if the write fails so we never leave the
    // installation without a usable key.
    try {
      await fs.rename(prevPath, path);
    } catch {
      // If even the rollback fails, surface the original error.
    }
    throw err;
  }
  return { oldKeypair, newKeypair };
}

/**
 * Delete the `.prev` keypair backup once the cloud has accepted the rotation.
 */
export async function commitRotation(configDir: string): Promise<void> {
  const prevPath = join(configDir, `${FILENAME}.prev`);
  try {
    await fs.unlink(prevPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/**
 * Restore the previous keypair from `.prev` (called after a failed rotation).
 * If `.prev` is missing the function is a no-op.
 */
export async function revertRotation(configDir: string): Promise<boolean> {
  const path = join(configDir, FILENAME);
  const prevPath = join(configDir, `${FILENAME}.prev`);
  try {
    await fs.rename(prevPath, path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

export async function getCurrentKid(configDir: string): Promise<string> {
  const kp = await loadOrCreateKeypair(configDir);
  return kp.kid;
}

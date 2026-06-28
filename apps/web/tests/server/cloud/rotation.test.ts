import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { cloudSettings } from '@/server/db/settings/cloud';
import {
  loadOrCreateKeypair,
  rotateKeypairWithBackup,
  commitRotation,
  revertRotation,
} from '@/server/cloud/key';
import { rotateKey } from '@/server/cloud/rotation';

type FetchArgs = Parameters<typeof fetch>;

let tmpDb: string;
let keyDir: string;

beforeEach(() => {
  tmpDb = mkdtempSync(join(tmpdir(), 'bk-rot-db-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmpDb, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });

  keyDir = mkdtempSync(join(tmpdir(), 'bk-rot-key-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = keyDir;
  process.env.BOOKKEEPRR_PUBLIC_FQDN = 'bookkeeprr.test';
});

afterEach(() => {
  closeDb();
  rmSync(tmpDb, { recursive: true, force: true });
  rmSync(keyDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  delete process.env.BOOKKEEPRR_PUBLIC_FQDN;
});

describe('rotateKeypairWithBackup', () => {
  it('creates a new keypair with a different kid and preserves the old one as .prev', async () => {
    const before = await loadOrCreateKeypair(keyDir);
    const { oldKeypair, newKeypair } = await rotateKeypairWithBackup(keyDir);
    expect(oldKeypair.kid).toBe(before.kid);
    expect(newKeypair.kid).not.toBe(before.kid);
    expect(existsSync(join(keyDir, 'cloud_keypair.json'))).toBe(true);
    expect(existsSync(join(keyDir, 'cloud_keypair.json.prev'))).toBe(true);
    const current = await loadOrCreateKeypair(keyDir);
    expect(current.kid).toBe(newKeypair.kid);
  });

  it('commitRotation deletes the .prev file', async () => {
    await loadOrCreateKeypair(keyDir);
    await rotateKeypairWithBackup(keyDir);
    expect(existsSync(join(keyDir, 'cloud_keypair.json.prev'))).toBe(true);
    await commitRotation(keyDir);
    expect(existsSync(join(keyDir, 'cloud_keypair.json.prev'))).toBe(false);
  });

  it('revertRotation restores the old keypair from .prev', async () => {
    const before = await loadOrCreateKeypair(keyDir);
    await rotateKeypairWithBackup(keyDir);
    const reverted = await revertRotation(keyDir);
    expect(reverted).toBe(true);
    const current = await loadOrCreateKeypair(keyDir);
    expect(current.kid).toBe(before.kid);
  });

  it('revertRotation returns false when no .prev exists', async () => {
    await loadOrCreateKeypair(keyDir);
    const reverted = await revertRotation(keyDir);
    expect(reverted).toBe(false);
  });
});

describe('rotateKey', () => {
  it('skips when cloud is not connected', async () => {
    const result = await rotateKey();
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') {
      expect(result.reason).toBe('cloud_not_connected');
    }
  });

  it('commits the rotation and clears the cached access token on cloud success', async () => {
    await cloudSettings.set({
      enabled: true,
      tenantId: 'tnt-1',
      accessToken: 'cached',
      accessTokenExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ kid: 'new-kid' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await rotateKey();
    expect(result.status).toBe('rotated');
    expect(existsSync(join(keyDir, 'cloud_keypair.json.prev'))).toBe(false);

    const stored = await cloudSettings.get();
    expect(stored.accessToken).toBeNull();
    expect(stored.accessTokenExpiresAt).toBeNull();

    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toMatch(/\/v1\/tenants\/tnt-1\/key$/);
    const init = call[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.public_jwk).toBeDefined();
    expect(body.public_jwk.kty).toBe('OKP');
  });

  it('reverts to the old keypair when the cloud rejects the rotation', async () => {
    await cloudSettings.set({ enabled: true, tenantId: 'tnt-2' });
    const original = await loadOrCreateKeypair(keyDir);

    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => new Response('nope', { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await rotateKey();
    expect(result.status).toBe('failed');

    // .prev should be gone (restored) and current kid should match original.
    expect(existsSync(join(keyDir, 'cloud_keypair.json.prev'))).toBe(false);
    const current = await loadOrCreateKeypair(keyDir);
    expect(current.kid).toBe(original.kid);

    const stored = await cloudSettings.get();
    expect(stored.lastRegisterError).toMatch(/key_rotation/);
  });
});

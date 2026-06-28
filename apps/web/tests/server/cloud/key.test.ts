import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadOrCreateKeypair } from '@/server/cloud/key';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bk-cloud-key-'));
});

describe('cloud keypair', () => {
  it('creates keypair file on first call', async () => {
    const kp = await loadOrCreateKeypair(dir);
    expect(existsSync(join(dir, 'cloud_keypair.json'))).toBe(true);
    expect(kp.kid).toMatch(/^[0-9a-f]{16}$/);
    expect(kp.publicJwk.kty).toBe('OKP');
    expect(kp.publicJwk.crv).toBe('Ed25519');
    expect(kp.privateJwk.d).toBeTypeOf('string');
  });

  it('returns the same kid on subsequent calls', async () => {
    const a = await loadOrCreateKeypair(dir);
    const b = await loadOrCreateKeypair(dir);
    expect(a.kid).toBe(b.kid);
  });

  it('persists the keypair as JSON', async () => {
    await loadOrCreateKeypair(dir);
    const raw = readFileSync(join(dir, 'cloud_keypair.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.publicJwk.kty).toBe('OKP');
    expect(parsed.privateJwk.d).toBeTypeOf('string');
    expect(parsed.kid).toBeTypeOf('string');
    expect(parsed.createdAt).toBeTypeOf('string');
  });
});

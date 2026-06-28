import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadOrCreateKeypair } from '@/server/cloud/key';

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bk-jwks-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = dir;
  await loadOrCreateKeypair(dir);
});

describe('GET /.well-known/jwks.json', () => {
  it('returns a JWKS document with the current public key', async () => {
    const { GET } = await import('@/app/.well-known/jwks.json/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].kty).toBe('OKP');
    expect(body.keys[0].crv).toBe('Ed25519');
    expect(body.keys[0].kid).toMatch(/^[0-9a-f]{16}$/);
  });
});

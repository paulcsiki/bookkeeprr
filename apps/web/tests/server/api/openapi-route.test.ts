import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { GET } from '@/app/api/openapi.json/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://internal:3000/api/openapi.json', { headers });
}

describe('GET /api/openapi.json', () => {
  it('serves the generated document', async () => {
    const res = await GET(req({ host: 'internal:3000' }));
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toMatch(/^3\.1\./);
    // Registry currently has 97 paths documented (native + readarr + calendar).
    expect(Object.keys(doc.paths).length).toBeGreaterThan(90);
  });

  it('derives servers from forwarded headers (reverse proxy)', async () => {
    const res = await GET(
      req({
        host: 'internal:3000',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'bookkeeprr.example.com',
      }),
    );
    const doc = (await res.json()) as { servers: Array<{ url: string }> };
    expect(doc.servers).toEqual([{ url: 'https://bookkeeprr.example.com' }]);
  });

  it('falls back to the Host header when not proxied', async () => {
    const res = await GET(req({ host: 'internal:3000' }));
    const doc = (await res.json()) as { servers: Array<{ url: string }> };
    expect(doc.servers).toEqual([{ url: 'http://internal:3000' }]);
  });
});

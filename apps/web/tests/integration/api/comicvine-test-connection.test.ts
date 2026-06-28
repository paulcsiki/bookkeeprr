import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import {
  ConnectionTestFailureResponse,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import { POST } from '@/app/api/comicvine/test-connection/route';
import {
  __setComicVineFetcherForTests,
  __resetComicVineForTests,
} from '@/server/integrations/comicvine/client';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';

const F = (n: string) => readFileSync(join(process.cwd(), 'tests/fixtures/comicvine', n), 'utf-8');

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
  __resetComicVineForTests();
});
afterEach(() => h.cleanup());

describe('POST /api/comicvine/test-connection', () => {
  it('200 on success', async () => {
    __setComicVineFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => F('no-match.json'),
    }));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'goodkey' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'POST /api/comicvine/test-connection');
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('502 on invalid key', async () => {
    __setComicVineFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => F('invalid-key.json'),
    }));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'badkey' }),
      }),
    );
    expect(res.status).toBe(502);
    await expectShape(
      ConnectionTestFailureResponse,
      res,
      'POST /api/comicvine/test-connection (502)',
    );
  });

  it('400 on empty apiKey with no stored key', async () => {
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }),
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/comicvine/test-connection (400)');
  });

  it('falls back to the stored key when apiKey is blank', async () => {
    await comicVineApiKeySetting.set('storedkey');
    let seenUrl = '';
    __setComicVineFetcherForTests(async (url) => {
      seenUrl = url;
      return { ok: true, status: 200, headers: {}, text: async () => F('no-match.json') };
    });
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(seenUrl).toContain('api_key=storedkey');
  });

  it('falls back when apiKey is absent entirely', async () => {
    await comicVineApiKeySetting.set('storedkey');
    let seenUrl = '';
    __setComicVineFetcherForTests(async (url) => {
      seenUrl = url;
      return { ok: true, status: 200, headers: {}, text: async () => F('no-match.json') };
    });
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    expect(seenUrl).toContain('api_key=storedkey');
  });
});

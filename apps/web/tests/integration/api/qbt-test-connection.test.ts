import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import {
  ConnectionTestFailureResponse,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import { POST } from '@/app/api/qbt/test-connection/route';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
  __resetQbtForTests();
});
afterEach(() => h.cleanup());

describe('POST /api/qbt/test-connection', () => {
  it('200 on success', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      }
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
    });
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host: 'h', port: 1, username: 'u', password: 'p', useHttps: false }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'POST /api/qbt/test-connection');
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('502 on bad creds', async () => {
    __setQbtFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => 'Fails.',
    }));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          host: 'h',
          port: 1,
          username: 'u',
          password: 'wrong',
          useHttps: false,
        }),
      }),
    );
    expect(res.status).toBe(502);
    await expectShape(ConnectionTestFailureResponse, res, 'POST /api/qbt/test-connection (502)');
  });

  it('400 on bad shape', async () => {
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host: 42 }),
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/qbt/test-connection (400)');
  });

  it('falls back to the stored password when blank, keeping submitted fields', async () => {
    await qbtConnectionSetting.set({
      host: 'old',
      port: 9999,
      username: 'olduser',
      password: 'stored-secret',
      useHttps: true,
    });
    let loginBody = '';
    __setQbtFetcherForTests(async (url, init) => {
      if (url.endsWith('/api/v2/auth/login')) {
        loginBody = String((init as { body?: unknown } | undefined)?.body ?? '');
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      }
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
    });
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          host: 'newhost',
          port: 1,
          username: 'newuser',
          password: '',
          useHttps: false,
        }),
      }),
    );
    expect(res.status).toBe(200);
    // stored password used, but the submitted username (non-secret field) wins.
    expect(loginBody).toContain('password=stored-secret');
    expect(loginBody).toContain('username=newuser');
  });

  it('allows a passwordless connection (blank password, none stored)', async () => {
    let loginBody = '';
    __setQbtFetcherForTests(async (url, init) => {
      if (url.endsWith('/api/v2/auth/login')) {
        loginBody = String((init as { body?: unknown } | undefined)?.body ?? '');
        return { ok: true, status: 200, headers: { 'set-cookie': 'SID=abc' }, text: async () => 'Ok.' };
      }
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
    });
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host: 'h', port: 1, username: 'u', password: '', useHttps: false }),
      }),
    );
    expect(res.status).toBe(200); // passwordless qBittorrent is valid
    expect(loginBody).toContain('password=');
  });
});

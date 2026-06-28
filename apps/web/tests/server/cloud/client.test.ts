import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadOrCreateKeypair } from '@/server/cloud/key';
import { CloudClient } from '@/server/cloud/client';

type FetchArgs = Parameters<typeof fetch>;

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bk-client-'));
  await loadOrCreateKeypair(dir);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CloudClient.register', () => {
  it('POSTs to /v1/tenants/register with Bearer jwt and accepted-versions body', async () => {
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ tenant_id: 'tnt-1', jwk_kid: 'kid-1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const cli = new CloudClient('https://cloud.example', dir);
    const res = await cli.register({
      fqdn: 'bookkeeprr.local',
      installUuid: '00000000-0000-0000-0000-000000000001',
      acceptedEulaVersion: '1.0',
      acceptedPrivacyVersion: '1.0',
    });

    expect(res.tenantId).toBe('tnt-1');
    expect(res.jwkKid).toBe('kid-1');

    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe('https://cloud.example/v1/tenants/register');
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer /);
    const body = JSON.parse(init.body as string);
    expect(body.accepted_eula_version).toBe('1.0');
    expect(body.accepted_privacy_version).toBe('1.0');
    expect(typeof body.accepted_at).toBe('string');
  });
});

describe('CloudClient.push', () => {
  it('translates camelCase args to snake_case body and maps results back', async () => {
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            results: [{ device_token: 'd1', status: 'delivered', message_id: 'm-1' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const cli = new CloudClient('https://cloud.example', dir);
    const res = await cli.push({
      accessToken: 'tok',
      deviceTokens: ['d1'],
      payload: { title: 't', body: 'b', deepLink: 'bookkeeprr://x', data: { a: '1' } },
    });

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.device_tokens).toEqual(['d1']);
    expect(body.payload.deep_link).toBe('bookkeeprr://x');
    expect(body.payload.data).toEqual({ a: '1' });
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');

    expect(res.results).toEqual([
      { deviceToken: 'd1', status: 'delivered', messageId: 'm-1', error: undefined },
    ]);
  });
});

describe('CloudClient.unregisterDevice', () => {
  it('DELETEs and tolerates 404', async () => {
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => new Response(null, { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const cli = new CloudClient('https://cloud.example', dir);
    await expect(
      cli.unregisterDevice({
        tenantId: 'tnt-1',
        accessToken: 'tok',
        deviceToken: 'tok with spaces',
      }),
    ).resolves.toBeUndefined();

    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe('https://cloud.example/v1/tenants/tnt-1/devices/tok%20with%20spaces');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('DELETE');
  });
});

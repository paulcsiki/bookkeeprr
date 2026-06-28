import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST as CONNECT } from '@/app/api/settings/cloud/connect/route';
import { POST as DISCONNECT } from '@/app/api/settings/cloud/disconnect/route';
import { GET as GET_SETTINGS } from '@/app/api/settings/cloud/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { cloudSettings } from '@/server/db/settings/cloud';
import { loadOrCreateKeypair } from '@/server/cloud/key';

type FetchArgs = Parameters<typeof fetch>;

let h: SeedHandle;
let keyDir: string;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  keyDir = mkdtempSync(join(tmpdir(), 'bk-cloud-settings-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = keyDir;
  process.env.BOOKKEEPRR_PUBLIC_FQDN = 'bookkeeprr.test';
  await loadOrCreateKeypair(keyDir);
});

afterEach(() => {
  h.cleanup();
  vi.unstubAllGlobals();
  delete process.env.BOOKKEEPRR_PUBLIC_FQDN;
});

async function adminCookie(): Promise<string> {
  const admin = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

async function userCookie(): Promise<string> {
  const u = await insertUser({
    username: 'bob',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function req(method: 'GET' | 'POST', cookie: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/settings/cloud', {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/settings/cloud', () => {
  it('401 with no cookie', async () => {
    const res = await GET_SETTINGS(req('GET', null));
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    const res = await GET_SETTINGS(req('GET', await userCookie()));
    expect(res.status).toBe(403);
  });

  it('returns the current cloud settings for admin', async () => {
    const res = await GET_SETTINGS(req('GET', await adminCookie()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { config: { enabled: boolean; tenantId: string | null } };
    expect(body.config.enabled).toBe(false);
    expect(body.config.tenantId).toBeNull();
  });
});

describe('POST /api/settings/cloud/connect', () => {
  it('401 without cookie', async () => {
    const res = await CONNECT(
      req('POST', null, { acceptedEulaVersion: '1.0', acceptedPrivacyVersion: '1.0' }),
    );
    expect(res.status).toBe(401);
  });

  it('403 for non-admin', async () => {
    const res = await CONNECT(
      req('POST', await userCookie(), {
        acceptedEulaVersion: '1.0',
        acceptedPrivacyVersion: '1.0',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('422 with missing required fields', async () => {
    const res = await CONNECT(req('POST', await adminCookie(), { foo: 'bar' }));
    expect(res.status).toBe(422);
  });

  it('persists tenantId on successful registration', async () => {
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ tenant_id: 'tnt-abc', jwk_kid: 'kid-1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const res = await CONNECT(
      req('POST', await adminCookie(), {
        acceptedEulaVersion: '1.0',
        acceptedPrivacyVersion: '1.0',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { config: { tenantId: string; enabled: boolean } };
    expect(body.config.tenantId).toBe('tnt-abc');
    expect(body.config.enabled).toBe(true);

    const stored = await cloudSettings.get();
    expect(stored.tenantId).toBe('tnt-abc');
    expect(stored.enabled).toBe(true);
    expect(stored.acceptedEulaVersion).toBe('1.0');
  });

  it('409 when already connected', async () => {
    await cloudSettings.set({ enabled: true, tenantId: 'existing' });
    const res = await CONNECT(
      req('POST', await adminCookie(), {
        acceptedEulaVersion: '1.0',
        acceptedPrivacyVersion: '1.0',
      }),
    );
    expect(res.status).toBe(409);
  });

  it('502 + persists lastRegisterError on cloud failure', async () => {
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => new Response('boom', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const res = await CONNECT(
      req('POST', await adminCookie(), {
        acceptedEulaVersion: '1.0',
        acceptedPrivacyVersion: '1.0',
      }),
    );
    expect(res.status).toBe(502);
    const stored = await cloudSettings.get();
    expect(stored.enabled).toBe(false);
    expect(stored.lastRegisterError).toMatch(/HTTP 500/);
  });
});

describe('POST /api/settings/cloud/disconnect', () => {
  it('409 when not connected', async () => {
    const res = await DISCONNECT(req('POST', await adminCookie()));
    expect(res.status).toBe(409);
  });

  it('clears tenant + clears acceptance on success', async () => {
    await cloudSettings.set({
      enabled: true,
      tenantId: 'tnt-x',
      acceptedEulaVersion: '1.0',
      acceptedPrivacyVersion: '1.0',
      acceptedAt: new Date().toISOString(),
    });
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ deleted_at: new Date().toISOString(), devices_removed: 3 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const res = await DISCONNECT(req('POST', await adminCookie()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { devicesRemoved: number };
    expect(body.devicesRemoved).toBe(3);

    const stored = await cloudSettings.get();
    expect(stored.enabled).toBe(false);
    expect(stored.tenantId).toBeNull();
    expect(stored.acceptedEulaVersion).toBeNull();
  });

  it('502 when cloud delete fails, keeps tenant intact', async () => {
    await cloudSettings.set({ enabled: true, tenantId: 'tnt-x' });
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => new Response('nope', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const res = await DISCONNECT(req('POST', await adminCookie()));
    expect(res.status).toBe(502);
    const stored = await cloudSettings.get();
    expect(stored.enabled).toBe(true);
    expect(stored.tenantId).toBe('tnt-x');
  });
});

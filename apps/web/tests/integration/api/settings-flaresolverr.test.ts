import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { MessageResponse } from '@/server/openapi/schemas/common';
import {
  ConnectionTestFailureResponse,
  FlaresolverrSchema,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import { flaresolverrSetting } from '@/server/db/settings/flaresolverr';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import type * as FlaresolverrClientMod from '@/server/integrations/flaresolverr/client';

const { solveGetMock } = vi.hoisted(() => ({ solveGetMock: vi.fn() }));
vi.mock('@/server/integrations/flaresolverr/client', async (importOriginal) => {
  const actual = await importOriginal<typeof FlaresolverrClientMod>();
  return { ...actual, solveGet: solveGetMock };
});

import { GET, PUT } from '@/app/api/settings/flaresolverr/route';
import { POST } from '@/app/api/settings/flaresolverr/test/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
  solveGetMock.mockReset();
});
afterEach(() => h.cleanup());

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
  const user = await insertUser({
    username: 'plain',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

describe('PUT /api/settings/flaresolverr', () => {
  it('401 without a session', async () => {
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://fs:8191' }),
      }),
    );
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'PUT /api/settings/flaresolverr (401)');
  });

  it('403 for a non-admin', async () => {
    const cookie = await userCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://fs:8191' }),
      }),
    );
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'PUT /api/settings/flaresolverr (403)');
  });

  it('persists the URL', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://flaresolverr:8191' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PUT /api/settings/flaresolverr');
    expect(await flaresolverrSetting.get()).toEqual({ url: 'http://flaresolverr:8191' });
  });
});

describe('GET /api/settings/flaresolverr', () => {
  it('round-trips the stored URL unmasked', async () => {
    await flaresolverrSetting.set({ url: 'http://flaresolverr:8191' });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await expectShape(FlaresolverrSchema, res, 'GET /api/settings/flaresolverr');
    expect(body.url).toBe('http://flaresolverr:8191');
  });
});

describe('POST /api/settings/flaresolverr/test', () => {
  it('401 without a session', async () => {
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://fs:8191' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('403 for a non-admin', async () => {
    const cookie = await userCookie();
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://fs:8191' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('200 ok when the URL from the body solves', async () => {
    const cookie = await adminCookie();
    solveGetMock.mockResolvedValue({ html: '<html/>', userAgent: 'CF' });
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://flaresolverr:8191' }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'POST /api/settings/flaresolverr/test');
    expect((await res.json()).ok).toBe(true);
    expect(solveGetMock.mock.calls[0]![0]).toBe('http://flaresolverr:8191');
    // The stored value is untouched (still empty).
    expect((await flaresolverrSetting.get()).url).toBe('');
  });

  it('200 ok testing the stored URL when none in body', async () => {
    const cookie = await adminCookie();
    await flaresolverrSetting.set({ url: 'http://stored:8191' });
    solveGetMock.mockResolvedValue({ html: '<html/>', userAgent: null });
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    expect(solveGetMock.mock.calls[0]![0]).toBe('http://stored:8191');
  });

  it('502 with the error message when FlareSolverr fails', async () => {
    const cookie = await adminCookie();
    const { FlaresolverrError } = await import('@/server/integrations/flaresolverr/client');
    solveGetMock.mockRejectedValue(new FlaresolverrError('challenge failed'));
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://flaresolverr:8191' }),
      }),
    );
    expect(res.status).toBe(502);
    await expectShape(
      ConnectionTestFailureResponse,
      res,
      'POST /api/settings/flaresolverr/test (502)',
    );
    const b = await res.json();
    expect(b.ok).toBe(false);
    expect(b.error).toMatch(/challenge failed/);
  });

  it('502 when no URL is configured and none in body', async () => {
    const cookie = await adminCookie();
    const res = await POST(
      new Request('http://t', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(502);
    expect(solveGetMock).not.toHaveBeenCalled();
  });
});

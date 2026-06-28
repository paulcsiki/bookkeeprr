import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { UpdatesPatchResponse } from '@/server/openapi/schemas/settings';
import { GET as GetUpdates } from '@/app/api/updates/route';
import { POST as PostCheck } from '@/app/api/updates/check/route';
import { POST as PostChangelogSeen } from '@/app/api/updates/changelog-seen/route';
import { GET as GetReleases } from '@/app/api/updates/releases/route';
import { PATCH as PatchUpdates } from '@/app/api/settings/updates/route';
import { PATCH as PatchDeployment } from '@/app/api/settings/deployment-mode/route';
import * as ghClient from '@/server/integrations/github/client';
import {
  updatesStateSetting,
  updatesConfigSetting,
} from '@/server/db/settings/updates';
import { getUser } from '@/server/db/users';
import { deploymentModeOverrideSetting } from '@/server/db/settings/deployment';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  h.cleanup();
});

async function adminCookie(): Promise<string> {
  const user = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const session = await createSession({
    userId: user.id,
    userAgent: null,
    ipAddress: null,
  });
  return `bookkeeprr_session=${session.token}`;
}

async function adminCookieWithId(): Promise<{ cookie: string; userId: number }> {
  const user = await insertUser({
    username: 'admin2',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const session = await createSession({
    userId: user.id,
    userAgent: null,
    ipAddress: null,
  });
  return { cookie: `bookkeeprr_session=${session.token}`, userId: user.id };
}

describe('GET /api/updates', () => {
  it('returns combined buildInfo+state+config+mode', async () => {
    const cookie = await adminCookie();
    const r = await GetUpdates(new Request('http://test/api/updates', { headers: { cookie } }));
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      buildInfo: unknown;
      state: unknown;
      config: unknown;
      deploymentMode: string;
      updateAvailable: boolean;
      lastSeenVersion: string | null;
    };
    expect(body.buildInfo).toBeDefined();
    expect(body.state).toBeDefined();
    expect(body.config).toBeDefined();
    expect(['docker', 'kubernetes', 'standalone']).toContain(body.deploymentMode);
    expect(body.updateAvailable).toBe(false);
    expect(body.lastSeenVersion).toBeNull();
  });

  it('reports updateAvailable=true when state.latestVersion > build', async () => {
    const cookie = await adminCookie();
    await updatesStateSetting.set({
      latestVersion: 'v99.0.0',
      latestReleaseUrl: 'https://example.com',
      latestReleaseBody: null,
      latestPublishedAt: null,
      fetchedAt: '2026-05-26T00:00:00Z',
      fetchError: null,
    });
    const r = await GetUpdates(new Request('http://test/api/updates', { headers: { cookie } }));
    const body = (await r.json()) as { updateAvailable: boolean };
    expect(body.updateAvailable).toBe(true);
  });

  it('rejects non-admin', async () => {
    const r = await GetUpdates(new Request('http://test/api/updates'));
    expect([401, 403]).toContain(r.status);
  });
});

describe('POST /api/updates/check', () => {
  it('triggers a fetch and returns new state', async () => {
    vi.spyOn(ghClient, 'fetchReleases').mockResolvedValueOnce([
      {
        tagName: 'v99.0.0',
        name: null,
        body: null,
        htmlUrl: 'x',
        publishedAt: null,
        prerelease: false,
        draft: false,
      },
    ]);
    const cookie = await adminCookie();
    const r = await PostCheck(
      new Request('http://test/api/updates/check', {
        method: 'POST',
        headers: { cookie },
      }),
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { state: { latestVersion: string | null } };
    expect(body.state.latestVersion).toBe('v99.0.0');
  });

  it('429s when called twice within 60s', async () => {
    vi.spyOn(ghClient, 'fetchReleases').mockResolvedValue([]);
    const cookie = await adminCookie();
    const r1 = await PostCheck(
      new Request('http://test/api/updates/check', {
        method: 'POST',
        headers: { cookie },
      }),
    );
    expect(r1.status).toBe(200);
    const r2 = await PostCheck(
      new Request('http://test/api/updates/check', {
        method: 'POST',
        headers: { cookie },
      }),
    );
    expect(r2.status).toBe(429);
  });
});

describe('POST /api/updates/changelog-seen', () => {
  it('persists the supplied version on the user row', async () => {
    const { cookie, userId } = await adminCookieWithId();
    const r = await PostChangelogSeen(
      new Request('http://test/api/updates/changelog-seen', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ version: '1.0.0' }),
      }),
    );
    expect(r.status).toBe(200);
    const user = await getUser(userId);
    expect(user?.lastSeenChangelogVersion).toBe('1.0.0');
  });
});

describe('GET /api/updates/releases', () => {
  it('returns 502 when GitHub fetch fails (run first to keep cache empty)', async () => {
    vi.spyOn(ghClient, 'fetchReleases').mockRejectedValueOnce(
      new ghClient.GitHubError('rate-limited', 'reset at X'),
    );
    const cookie = await adminCookie();
    const r = await GetReleases(
      new Request('http://test/api/updates/releases', { headers: { cookie } }),
    );
    expect(r.status).toBe(502);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('serves cache-miss then cache-hit on successive calls', async () => {
    vi.spyOn(ghClient, 'fetchReleases').mockResolvedValueOnce([
      {
        tagName: 'v1.0.0',
        name: 'first',
        body: null,
        htmlUrl: 'https://example.com/r/1',
        publishedAt: null,
        prerelease: false,
        draft: false,
      },
    ]);
    const cookie = await adminCookie();
    const r1 = await GetReleases(
      new Request('http://test/api/updates/releases', { headers: { cookie } }),
    );
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { releases: unknown[]; cached: boolean };
    expect(Array.isArray(b1.releases)).toBe(true);
    expect(b1.releases.length).toBe(1);
    expect(b1.cached).toBe(false);

    const r2 = await GetReleases(
      new Request('http://test/api/updates/releases', { headers: { cookie } }),
    );
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { releases: unknown[]; cached: boolean };
    expect(b2.cached).toBe(true);
  });
});

describe('PATCH /api/settings/updates', () => {
  it('sets frequency', async () => {
    const cookie = await adminCookie();
    const r = await PatchUpdates(
      new Request('http://test/api/settings/updates', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ frequency: 'off' }),
      }),
    );
    expect(r.status).toBe(200);
    await expectShape(UpdatesPatchResponse, r, 'PATCH /api/settings/updates');
    const cfg = await updatesConfigSetting.get();
    expect(cfg.frequency).toBe('off');
  });

  it('sets behavior', async () => {
    const cookie = await adminCookie();
    const r = await PatchUpdates(
      new Request('http://test/api/settings/updates', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ behavior: 'auto-download' }),
      }),
    );
    expect(r.status).toBe(200);
    const cfg = await updatesConfigSetting.get();
    expect(cfg.behavior).toBe('auto-download');
  });

  it('returns 422 when a field has the wrong type', async () => {
    const cookie = await adminCookie();
    const r = await PatchUpdates(
      new Request('http://test/api/settings/updates', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ frequency: 'invalid-value' }),
      }),
    );
    expect(r.status).toBe(422);
    await expectShape(ErrorResponse, r, 'PATCH /api/settings/updates (422)');
  });
});

describe('PATCH /api/settings/deployment-mode', () => {
  it('sets a manual override', async () => {
    const cookie = await adminCookie();
    const r = await PatchDeployment(
      new Request('http://test/api/settings/deployment-mode', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ mode: 'docker' }),
      }),
    );
    expect(r.status).toBe(200);
    const override = await deploymentModeOverrideSetting.get();
    expect(override.mode).toBe('docker');
  });

  it('returns 422 when mode is not a valid enum value', async () => {
    const cookie = await adminCookie();
    const r = await PatchDeployment(
      new Request('http://test/api/settings/deployment-mode', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ mode: 'invalid-mode' }),
      }),
    );
    expect(r.status).toBe(422);
  });
});

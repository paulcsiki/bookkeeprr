import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { MatcherAutoReplayPatchResponse } from '@/server/openapi/schemas/settings';
import { PATCH as PatchWeights } from '@/app/api/settings/matcher/weights/route';
import { PATCH as PatchAutoReplay } from '@/app/api/settings/matcher/auto-replay/route';
import { matcherAutoReplaySetting } from '@/server/db/settings/matcher';
import { listReplayRuns } from '@/server/db/replay-runs';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});

afterEach(() => h.cleanup());

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

describe('/api/settings/matcher/auto-replay PATCH', () => {
  it('toggles the setting on and off', async () => {
    const cookie = await adminCookie();
    const r1 = await PatchAutoReplay(
      new Request('http://test/api/settings/matcher/auto-replay', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ enabled: true }),
      }),
    );
    expect(r1.status).toBe(200);
    await expectShape(
      MatcherAutoReplayPatchResponse,
      r1,
      'PATCH /api/settings/matcher/auto-replay',
    );
    expect(await matcherAutoReplaySetting.get()).toBe(true);

    const r2 = await PatchAutoReplay(
      new Request('http://test/api/settings/matcher/auto-replay', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ enabled: false }),
      }),
    );
    expect(r2.status).toBe(200);
    expect(await matcherAutoReplaySetting.get()).toBe(false);
  });
});

describe('weights PATCH post-save hook', () => {
  it('enqueues a replay when auto-replay is enabled and weights changed', async () => {
    const cookie = await adminCookie();
    await matcherAutoReplaySetting.set(true);
    const r = await PatchWeights(
      new Request('http://test/api/settings/matcher/weights', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ groupTopWeight: 120 }),
      }),
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      config: unknown;
      autoReplayEnqueued?: { runId: number };
    };
    expect(body.autoReplayEnqueued?.runId).toBeGreaterThan(0);
    const runs = await listReplayRuns(1);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.windowDays).toBe(90);
  });

  it('does not enqueue when auto-replay is disabled', async () => {
    const cookie = await adminCookie();
    await matcherAutoReplaySetting.set(false);
    const r = await PatchWeights(
      new Request('http://test/api/settings/matcher/weights', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ groupTopWeight: 130 }),
      }),
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { autoReplayEnqueued?: unknown };
    expect(body.autoReplayEnqueued).toBeUndefined();
    const runs = await listReplayRuns(1);
    expect(runs).toHaveLength(0);
  });

  it('does not enqueue when no fields actually changed', async () => {
    const cookie = await adminCookie();
    await matcherAutoReplaySetting.set(true);
    // First save establishes baseline
    await PatchWeights(
      new Request('http://test/api/settings/matcher/weights', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ groupTopWeight: 100 }),
      }),
    );
    const runsBefore = await listReplayRuns(10);
    // Identical save — shallowDiff is empty
    const r = await PatchWeights(
      new Request('http://test/api/settings/matcher/weights', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ groupTopWeight: 100 }),
      }),
    );
    expect(r.status).toBe(200);
    const runsAfter = await listReplayRuns(10);
    expect(runsAfter.length).toBe(runsBefore.length);
  });
});

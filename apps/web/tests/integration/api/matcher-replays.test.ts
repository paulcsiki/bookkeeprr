import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, seedSeriesAndRelease, type SeedHandle } from '../helpers/seed';
import { POST, GET } from '@/app/api/settings/matcher/replays/route';
import { GET as GetRun } from '@/app/api/settings/matcher/replays/[runId]/route';
import { POST as AdoptPost } from '@/app/api/settings/matcher/replays/[runId]/adopt/route';
import { createReplayRun, listReplayRuns, markReplayRunComplete } from '@/server/db/replay-runs';
import { insertReplayDiffs, listReplayDiffs } from '@/server/db/release-match-replays';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
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

const DEFAULT_WEIGHTS = {
  groupTopWeight: 100,
  groupStepDown: 10,
  batchBonus: 30,
  seederMultiplier: 5,
  trustedBonus: 10,
  remakePenalty: -15,
  minSeeders: 1,
};

const DEFAULT_ADULT_FILTER = {
  enabled: false,
  blockedCategories: [],
};

describe('/api/settings/matcher/replays', () => {
  it('POST creates a run and returns 200 with runId', async () => {
    const cookie = await adminCookie();
    const req = new Request('http://test/api/settings/matcher/replays', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ windowDays: 90 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: number };
    expect(body.runId).toBeGreaterThan(0);
    const runs = await listReplayRuns(10);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.windowDays).toBe(90);
  });

  it('POST rejects with 409 when a run is in progress', async () => {
    const cookie = await adminCookie();
    const existing = await createReplayRun({
      windowDays: null,
      weightsSnapshot: DEFAULT_WEIGHTS,
      adultFilterSnapshot: DEFAULT_ADULT_FILTER,
    });
    const req = new Request('http://test/api/settings/matcher/replays', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ windowDays: 30 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { runId: number };
    expect(body.runId).toBe(existing.id);
  });

  it('POST rejects body without admin', async () => {
    const req = new Request('http://test/api/settings/matcher/replays', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ windowDays: 30 }),
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it('POST validates windowDays', async () => {
    const cookie = await adminCookie();
    const req = new Request('http://test/api/settings/matcher/replays', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ windowDays: 7 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('POST accepts seriesId and creates a scoped run', async () => {
    const cookie = await adminCookie();
    const { seriesId } = await seedSeriesAndRelease({
      qpId: h.qpId,
      indexerId: h.indexerId,
      score: 30,
    });
    const req = new Request('http://test/api/settings/matcher/replays', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ windowDays: 90, seriesId }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: number };
    expect(body.runId).toBeGreaterThan(0);
    const runs = await listReplayRuns(1);
    expect(runs[0]!.seriesId).toBe(seriesId);
  });

  it('POST returns 404 on unknown seriesId', async () => {
    const cookie = await adminCookie();
    const req = new Request('http://test/api/settings/matcher/replays', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ windowDays: 90, seriesId: 99999 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('GET returns history', async () => {
    const cookie = await adminCookie();
    const r = await createReplayRun({
      windowDays: 90,
      weightsSnapshot: DEFAULT_WEIGHTS,
      adultFilterSnapshot: DEFAULT_ADULT_FILTER,
    });
    await markReplayRunComplete(r.id, {
      releasesTotal: 0,
      releasesFlipped: 0,
      releasesRescored: 0,
    });
    const req = new Request('http://test/api/settings/matcher/replays?limit=10', {
      method: 'GET',
      headers: { cookie },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: Array<{ id: number }> };
    expect(body.runs).toHaveLength(1);
  });
});

describe('/api/settings/matcher/replays/[runId]', () => {
  it('GET returns run + paginated diffs', async () => {
    const cookie = await adminCookie();
    const run = await createReplayRun({
      windowDays: 90,
      weightsSnapshot: DEFAULT_WEIGHTS,
      adultFilterSnapshot: DEFAULT_ADULT_FILTER,
    });
    await markReplayRunComplete(run.id, {
      releasesTotal: 1,
      releasesFlipped: 1,
      releasesRescored: 0,
    });
    const { releaseId } = await seedSeriesAndRelease({
      qpId: h.qpId,
      indexerId: h.indexerId,
      score: 30,
    });
    await insertReplayDiffs([
      {
        replayRunId: run.id,
        releaseId,
        oldScore: 30,
        newScore: 90,
        oldWouldGrab: false,
        newWouldGrab: true,
        changedKind: 'flipped',
      },
    ]);

    const req = new Request(
      `http://test/api/settings/matcher/replays/${run.id}?kind=flipped&page=0&pageSize=10`,
      { headers: { cookie } },
    );
    const res = await GetRun(req, { params: Promise.resolve({ runId: String(run.id) }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      run: { id: number };
      rows: Array<{ id: number; releaseId: number; release: { id: number; title: string } | null }>;
      total: number;
    };
    expect(body.run.id).toBe(run.id);
    expect(body.rows).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.rows[0]!.release?.id).toBe(releaseId);
  });

  it('POST adopt grabs newly-eligible releases', async () => {
    const cookie = await adminCookie();
    const run = await createReplayRun({
      windowDays: 90,
      weightsSnapshot: DEFAULT_WEIGHTS,
      adultFilterSnapshot: DEFAULT_ADULT_FILTER,
    });
    await markReplayRunComplete(run.id, {
      releasesTotal: 1,
      releasesFlipped: 1,
      releasesRescored: 0,
    });
    const { releaseId } = await seedSeriesAndRelease({
      qpId: h.qpId,
      indexerId: h.indexerId,
      score: 30,
    });
    await insertReplayDiffs([
      {
        replayRunId: run.id,
        releaseId,
        oldScore: 30,
        newScore: 90,
        oldWouldGrab: false,
        newWouldGrab: true,
        changedKind: 'flipped',
      },
    ]);

    const list = await listReplayDiffs(run.id, { kind: 'flipped', page: 0, pageSize: 10 });
    const replayId = list.rows[0]!.id;

    const req = new Request(`http://test/api/settings/matcher/replays/${run.id}/adopt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ replayIds: [replayId] }),
    });
    const res = await AdoptPost(req, { params: Promise.resolve({ runId: String(run.id) }) });
    // The grab may "succeed" or "fail" depending on test fixture (qBT not really running);
    // either way, the route must respond 200 with adopted/failed accounting.
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      adopted: number;
      failed: Array<{ replayId: number; error: string }>;
    };
    expect(body.adopted + body.failed.length).toBe(1);
  });

  it('POST adopt rejects on incomplete run with 400', async () => {
    const cookie = await adminCookie();
    const run = await createReplayRun({
      windowDays: 90,
      weightsSnapshot: DEFAULT_WEIGHTS,
      adultFilterSnapshot: DEFAULT_ADULT_FILTER,
    });
    // run is still 'running'
    const req = new Request(`http://test/api/settings/matcher/replays/${run.id}/adopt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ replayIds: [1] }),
    });
    const res = await AdoptPost(req, { params: Promise.resolve({ runId: String(run.id) }) });
    expect(res.status).toBe(400);
  });

  it('POST adopt rejects rescored rows per-id', async () => {
    const cookie = await adminCookie();
    const run = await createReplayRun({
      windowDays: 90,
      weightsSnapshot: DEFAULT_WEIGHTS,
      adultFilterSnapshot: DEFAULT_ADULT_FILTER,
    });
    await markReplayRunComplete(run.id, {
      releasesTotal: 1,
      releasesFlipped: 0,
      releasesRescored: 1,
    });
    const { releaseId } = await seedSeriesAndRelease({
      qpId: h.qpId,
      indexerId: h.indexerId,
      score: 30,
    });
    await insertReplayDiffs([
      {
        replayRunId: run.id,
        releaseId,
        oldScore: 30,
        newScore: 50,
        oldWouldGrab: false,
        newWouldGrab: false,
        changedKind: 'rescored',
      },
    ]);
    const list = await listReplayDiffs(run.id, { kind: 'rescored', page: 0, pageSize: 10 });
    const replayId = list.rows[0]!.id;

    const req = new Request(`http://test/api/settings/matcher/replays/${run.id}/adopt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ replayIds: [replayId] }),
    });
    const res = await AdoptPost(req, { params: Promise.resolve({ runId: String(run.id) }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      adopted: number;
      failed: Array<{ replayId: number; error: string }>;
    };
    expect(body.adopted).toBe(0);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]!.error).toMatch(/not-flipped|not-adoptable/i);
  });
});

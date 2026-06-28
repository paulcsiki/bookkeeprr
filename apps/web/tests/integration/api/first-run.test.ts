import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { firstRunCompleteSetting } from '@/server/db/settings/first-run';
import { GET as getStatus } from '@/app/api/first-run/status/route';
import { POST as postComplete } from '@/app/api/first-run/complete/route';
import { expectShape } from '../../helpers/assert-spec';
import {
  FirstRunCompleteResponse,
  FirstRunStatusResponse,
} from '@/server/openapi/schemas/system';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

const completeReq = (): Request =>
  new Request('http://t/api/first-run/complete', { method: 'POST' });

describe('first-run API', () => {
  it('GET /api/first-run/status returns { complete: false } initially', async () => {
    const res = await getStatus();
    expect(res.status).toBe(200);
    await expectShape(FirstRunStatusResponse, res, 'GET /api/first-run/status');
    const body = await res.json();
    expect(body).toEqual({ complete: false });
  });

  it('POST /api/first-run/complete flips the flag', async () => {
    const res = await postComplete(completeReq());
    expect(res.status).toBe(200);
    await expectShape(FirstRunCompleteResponse, res, 'POST /api/first-run/complete');
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(await firstRunCompleteSetting.get()).toBe(true);
  });

  it('POST /api/first-run/complete is idempotent', async () => {
    await postComplete(completeReq());
    const res = await postComplete(completeReq());
    expect(res.status).toBe(200);
    expect(await firstRunCompleteSetting.get()).toBe(true);
  });

  it('GET reflects state after completion', async () => {
    await postComplete(completeReq());
    const res = await getStatus();
    const body = await res.json();
    expect(body).toEqual({ complete: true });
  });
});

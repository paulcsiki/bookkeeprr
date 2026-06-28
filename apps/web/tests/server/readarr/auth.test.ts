import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { apiKeySetting } from '@/server/db/settings/api-key';
import { validateApiKey, readarrError } from '@/server/readarr/auth';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('validateApiKey', () => {
  it("returns 'ok-no-key-set' when no key is configured (auth disabled)", async () => {
    const req = new Request('http://x/api/series');
    expect(await validateApiKey(req)).toBe('ok-no-key-set');
  });

  it("returns 'ok-key-set' when key matches X-Api-Key header", async () => {
    await apiKeySetting.set({ key: 'secret-key', createdAt: '2026-05-24T00:00:00Z' });
    const req = new Request('http://x/api/series', { headers: { 'x-api-key': 'secret-key' } });
    expect(await validateApiKey(req)).toBe('ok-key-set');
  });

  it("returns 'unauthorized' when header is missing", async () => {
    await apiKeySetting.set({ key: 'secret-key', createdAt: '2026-05-24T00:00:00Z' });
    const req = new Request('http://x/api/series');
    expect(await validateApiKey(req)).toBe('unauthorized');
  });

  it("returns 'unauthorized' when header is wrong", async () => {
    await apiKeySetting.set({ key: 'secret-key', createdAt: '2026-05-24T00:00:00Z' });
    const req = new Request('http://x/api/series', { headers: { 'x-api-key': 'wrong' } });
    expect(await validateApiKey(req)).toBe('unauthorized');
  });
});

describe('readarrError', () => {
  it('returns Readarr-shaped error body', async () => {
    const res = readarrError(400, 'Bad', 'detail string');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ message: 'Bad', description: 'detail string' });
  });

  it('omits description when not provided', async () => {
    const res = readarrError(401, 'Unauthorized');
    const body = await res.json();
    expect(body).toEqual({ message: 'Unauthorized' });
  });
});

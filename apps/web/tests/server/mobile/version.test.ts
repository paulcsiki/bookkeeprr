import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { GET } from '@/app/api/mobile/version/route';
import { MIN_SUPPORTED_MOBILE_VERSION, getCurrentServerVersion } from '@/server/mobile/version';

describe('GET /api/mobile/version', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('returns the current server version and minimum supported mobile version', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { current: string; min_supported: string };
    expect(body.current).toBe(getCurrentServerVersion());
    expect(body.min_supported).toBe(MIN_SUPPORTED_MOBILE_VERSION);
  });

  it('current is a non-empty semver-shaped string from package.json', async () => {
    const res = await GET();
    const body = (await res.json()) as { current: string };
    expect(body.current.length).toBeGreaterThan(0);
    expect(body.current).toMatch(/^\d+\.\d+\.\d+/);
  });
});

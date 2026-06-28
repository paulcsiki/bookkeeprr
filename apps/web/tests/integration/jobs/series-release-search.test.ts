import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { seriesReleaseSearchDescriptor } from '@/server/jobs/kinds/series-release-search';
import { updateSeries } from '@/server/db/series';
import * as searchSeries from '@/server/releases/search-series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ anilistId: 105778 });
  vi.restoreAllMocks();
});
afterEach(() => h.cleanup());

describe('series_release_search job', () => {
  it('runs the per-series search for a monitored series', async () => {
    const spy = vi
      .spyOn(searchSeries, 'searchReleasesForSeries')
      .mockResolvedValue({ upserted: 2, errors: [], skippedNoProfile: false });
    await enqueueJob('series_release_search', { seriesId: h.seriesId });
    expect(await runOnce(seriesReleaseSearchDescriptor)).toBe('ran');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0].id).toBe(h.seriesId);
  });

  it('no-ops cleanly when the series does not exist', async () => {
    const spy = vi.spyOn(searchSeries, 'searchReleasesForSeries');
    await enqueueJob('series_release_search', { seriesId: 999999 });
    expect(await runOnce(seriesReleaseSearchDescriptor)).toBe('ran');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not search an unmonitored series (monitoring = none)', async () => {
    await updateSeries(h.seriesId, { monitoring: 'none' });
    const spy = vi.spyOn(searchSeries, 'searchReleasesForSeries');
    await enqueueJob('series_release_search', { seriesId: h.seriesId });
    expect(await runOnce(seriesReleaseSearchDescriptor)).toBe('ran');
    expect(spy).not.toHaveBeenCalled();
  });
});

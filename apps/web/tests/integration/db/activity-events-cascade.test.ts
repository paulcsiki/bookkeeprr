/**
 * Test: deleting a series removes its activity_events rows (cascade).
 * TDD red phase — these fail until the schema + migration are applied.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries, deleteSeries } from '@/server/db/series';
import { recordActivity, listRecentActivity } from '@/server/db/activity-events';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('activityEvents cascade on series delete', () => {
  it('removes activity rows for the deleted series but keeps others', async () => {
    // Create a second series so we can verify that its rows survive.
    const otherId = await insertSeries({
      anilistId: 9999,
      status: 'releasing',
      rootPath: '/media/comics/Other',
      qualityProfileId: h.qpId,
      titleEnglish: 'Other Series',
    });

    // Write two events for the series under test.
    await recordActivity({ kind: 'added', seriesId: h.seriesId });
    await recordActivity({ kind: 'grabbed', seriesId: h.seriesId });
    // Write one event for the other series that must survive.
    await recordActivity({ kind: 'added', seriesId: otherId });

    const before = await listRecentActivity(50);
    expect(before).toHaveLength(3);

    // Delete the first series — its activity rows should cascade away.
    await deleteSeries(h.seriesId);

    const after = await listRecentActivity(50);
    expect(after).toHaveLength(1);
    expect(after[0]!.seriesId).toBe(otherId);
    expect(after[0]!.kind).toBe('added');
  });

  it('only removes activity rows for the deleted series (no cross-contamination)', async () => {
    const s2 = await insertSeries({
      anilistId: 8888,
      status: 'releasing',
      rootPath: '/media/comics/Safe',
      qualityProfileId: h.qpId,
      titleEnglish: 'Safe Series',
    });

    await recordActivity({ kind: 'finished', seriesId: h.seriesId });
    await recordActivity({ kind: 'finished', seriesId: s2 });

    await deleteSeries(h.seriesId);

    const remaining = await listRecentActivity(50);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.seriesId).toBe(s2);
  });

  it('leaves activity rows with null seriesId untouched', async () => {
    // System events with no seriesId must survive any series delete.
    await recordActivity({ kind: 'imported', seriesId: null });
    await recordActivity({ kind: 'grabbed', seriesId: h.seriesId });

    await deleteSeries(h.seriesId);

    const remaining = await listRecentActivity(50);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.seriesId).toBeNull();
  });
});

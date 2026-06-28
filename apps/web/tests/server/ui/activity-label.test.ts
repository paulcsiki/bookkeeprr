import { describe, expect, it } from 'vitest';
import { activityLabel } from '@/app/(app)/library/[id]/HydrationIndicator';

describe('activityLabel', () => {
  it('labels release search', () => {
    expect(activityLabel(['series_release_search'])).toBe('Searching releases…');
  });
  it('still labels volumes', () => {
    expect(activityLabel(['mangadex_volume_hydrate'])).toBe('Fetching volumes…');
  });
  it('mixes to Working…', () => {
    expect(activityLabel(['mangadex_volume_hydrate', 'series_release_search'])).toBe('Working…');
  });
});

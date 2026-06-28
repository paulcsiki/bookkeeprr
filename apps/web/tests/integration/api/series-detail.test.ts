import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import SeriesDetailPage from '@/app/(app)/library/[id]/page';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ anilistId: 555 });
});
afterEach(() => h.cleanup());

describe('library/[id]/page', () => {
  it('renders for valid id without throwing', async () => {
    const result = await SeriesDetailPage({ params: Promise.resolve({ id: String(h.seriesId) }) });
    // Result is a JSX element; just verify it exists. Tabs render via client component, not in this server-render test.
    expect(result).toBeDefined();
  });

  it('calls notFound() for missing id', async () => {
    await expect(SeriesDetailPage({ params: Promise.resolve({ id: '99999' }) })).rejects.toThrow();
  });

  it('calls notFound() for non-numeric id', async () => {
    await expect(SeriesDetailPage({ params: Promise.resolve({ id: 'abc' }) })).rejects.toThrow();
  });
});

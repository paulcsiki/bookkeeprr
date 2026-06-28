import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveNuSlug } from '@/server/integrations/novelupdates/resolve';
import * as nuClient from '@/server/integrations/novelupdates/client';

describe('resolveNuSlug', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns high-confidence match when normalized title is exact', async () => {
    vi.spyOn(nuClient, 'searchNovelUpdates').mockResolvedValueOnce([
      {
        slug: 'mushoku-tensei',
        title: 'Mushoku Tensei: Jobless Reincarnation',
        coverUrl: null,
        year: null,
      },
      { slug: 'something-else', title: 'Something Else', coverUrl: null, year: null },
    ]);
    const r = await resolveNuSlug({
      title: 'Mushoku Tensei: Jobless Reincarnation',
      altTitles: [],
    });
    expect(r.match).toBe('high');
    if (r.match === 'high') {
      expect(r.slug).toBe('mushoku-tensei');
      expect(r.candidateTitle).toBe('Mushoku Tensei: Jobless Reincarnation');
    }
  });

  it('returns high-confidence when an alt title exactly matches a candidate title', async () => {
    vi.spyOn(nuClient, 'searchNovelUpdates').mockResolvedValueOnce([
      {
        slug: 'mushoku-tensei',
        title: 'Mushoku Tensei: Jobless Reincarnation',
        coverUrl: null,
        year: null,
      },
    ]);
    const r = await resolveNuSlug({
      title: 'Mushoku Tensei',
      altTitles: ['Mushoku Tensei: Jobless Reincarnation'],
    });
    expect(r.match).toBe('high');
    if (r.match === 'high') {
      expect(r.slug).toBe('mushoku-tensei');
    }
  });

  it('returns none when no candidate scores >= threshold', async () => {
    vi.spyOn(nuClient, 'searchNovelUpdates').mockResolvedValueOnce([
      { slug: 'unrelated', title: 'Completely Different', coverUrl: null, year: null },
    ]);
    const r = await resolveNuSlug({ title: 'Mushoku Tensei', altTitles: [] });
    expect(r.match).toBe('none');
    expect(r.slug).toBeNull();
  });

  it('returns none when search returns no hits', async () => {
    vi.spyOn(nuClient, 'searchNovelUpdates').mockResolvedValueOnce([]);
    const r = await resolveNuSlug({ title: 'Anything', altTitles: [] });
    expect(r.match).toBe('none');
  });
});

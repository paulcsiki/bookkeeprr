import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { audiobookHydrateDescriptor } from '@/server/jobs/kinds/audiobook-hydrate';
import { insertSeries, getSeries } from '@/server/db/series';
import * as itunes from '@/server/integrations/itunes/client';
import type { ITunesAudiobookHit } from '@/server/integrations/itunes/client';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  // Network guard: no audiobook_hydrate test should reach the real iTunes API.
  // Default the search to an empty result; tests that exercise a hit re-spy with
  // their own resolved value, which overrides this.
  vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([]);
});
afterEach(() => {
  h.cleanup();
  vi.restoreAllMocks();
});

function hit(overrides: Partial<ITunesAudiobookHit> = {}): ITunesAudiobookHit {
  return {
    id: '12345',
    title: 'Sabriel',
    author: 'Garth Nix',
    releaseYear: 1995,
    coverUrl: 'https://itunes.example/600x600bb.jpg',
    collectionId: 12345,
    collectionName: 'The Old Kingdom',
    trackName: 'Sabriel',
    description: 'Sent to a boarding school in Ancelstierre...',
    ...overrides,
  };
}

async function makeAudiobook(opts: {
  description?: string | null;
  coverUrl?: string | null;
  startYear?: number | null;
  narrator?: string | null;
  author?: string | null;
  contentType?: 'audiobook' | 'manga';
}): Promise<number> {
  const id = await insertSeries({
    contentType: opts.contentType ?? 'audiobook',
    author: opts.author === undefined ? 'Garth Nix' : opts.author,
    narrator: opts.narrator ?? null,
    titleEnglish: 'Sabriel',
    status: 'finished',
    rootPath: '/media/audiobooks/Garth Nix/Sabriel',
    qualityProfileId: h.qpId,
    coverUrl: opts.coverUrl ?? null,
    description: opts.description ?? null,
    startYear: opts.startYear ?? null,
    totalVolumes: 1,
    granularity: 'volume',
    monitoring: 'future',
  });
  return id;
}

describe('audiobook_hydrate', () => {
  it('fills description + startYear + cover from iTunes when null', async () => {
    const id = await makeAudiobook({ description: null, coverUrl: null, startYear: null });
    const spy = vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([hit()]);

    const result = await audiobookHydrateDescriptor.handler({ seriesId: id }, 1);

    // Author is known → query is "<title> <author>".
    expect(spy).toHaveBeenCalledWith('Sabriel Garth Nix');
    expect(result.fieldsUpdated).toContain('description');
    expect(result.fieldsUpdated).toContain('startYear');
    expect(result.fieldsUpdated).toContain('coverUrl');

    const updated = await getSeries(id);
    expect(updated!.description).toBe('Sent to a boarding school in Ancelstierre...');
    expect(updated!.startYear).toBe(1995);
    expect(updated!.coverUrl).toBe('https://itunes.example/600x600bb.jpg');
  });

  it('prefers the English "(Unabridged)" edition over a bare foreign-language hit', async () => {
    // iTunes returns the correct English "Sabriel (Unabridged)" first, then a
    // bare foreign-language "Sabriel". The edition tag must be stripped so the
    // English one matches "Sabriel" and wins (regression: a Danish edition was
    // being chosen, giving a wrong-language description).
    const id = await makeAudiobook({ description: null, startYear: null, coverUrl: null });
    vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([
      hit({
        trackName: 'Sabriel (Unabridged)',
        description: 'The English synopsis.',
        releaseYear: 2002,
      }),
      hit({
        trackName: 'Sabriel',
        description: 'Hvem vil våge over de levende…',
        releaseYear: 2023,
      }),
    ]);

    await audiobookHydrateDescriptor.handler({ seriesId: id }, 1);

    const updated = await getSeries(id);
    expect(updated!.description).toBe('The English synopsis.');
    expect(updated!.startYear).toBe(2002);
  });

  it('searches by title only when no author is set', async () => {
    const id = await makeAudiobook({ author: null, description: null });
    const spy = vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([hit({ author: null })]);

    await audiobookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(spy).toHaveBeenCalledWith('Sabriel');
  });

  it('does not overwrite an existing description / startYear / cover', async () => {
    const id = await makeAudiobook({
      description: 'User-set synopsis',
      startYear: 2001,
      coverUrl: 'https://discover.example/cover.jpg',
    });
    const spy = vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([hit()]);

    const result = await audiobookHydrateDescriptor.handler({ seriesId: id }, 1);

    // All backfillable fields (description/startYear/cover) are set, so there is
    // nothing to backfill and no search happens.
    expect(spy).not.toHaveBeenCalled();
    expect(result.fieldsUpdated).toEqual([]);

    const updated = await getSeries(id);
    expect(updated!.description).toBe('User-set synopsis');
    expect(updated!.startYear).toBe(2001);
    expect(updated!.coverUrl).toBe('https://discover.example/cover.jpg');
  });

  it('fills only the still-null fields', async () => {
    const id = await makeAudiobook({
      description: 'User-set synopsis',
      startYear: null,
      coverUrl: 'https://discover.example/cover.jpg',
    });
    vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([hit()]);

    const result = await audiobookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(result.fieldsUpdated).toEqual(['startYear']);
    const updated = await getSeries(id);
    expect(updated!.description).toBe('User-set synopsis');
    expect(updated!.startYear).toBe(1995);
    expect(updated!.coverUrl).toBe('https://discover.example/cover.jpg');
  });

  it('does not match an unrelated iTunes hit', async () => {
    const id = await makeAudiobook({ description: null });
    vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([
      hit({ trackName: 'Something Completely Different', title: 'Something Completely Different' }),
    ]);

    const result = await audiobookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(result.fieldsUpdated).toEqual([]);
    const updated = await getSeries(id);
    expect(updated!.description).toBeNull();
  });

  it('is best-effort: an iTunes failure returns empty without throwing', async () => {
    const id = await makeAudiobook({ description: null });
    vi.spyOn(itunes, 'searchAudiobooks').mockRejectedValue(new Error('network down'));

    const result = await audiobookHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(result.fieldsUpdated).toEqual([]);
  });

  it('is idempotent on a second run', async () => {
    const id = await makeAudiobook({ description: null, coverUrl: null, startYear: null });
    vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([hit()]);

    await audiobookHydrateDescriptor.handler({ seriesId: id }, 1);
    const second = await audiobookHydrateDescriptor.handler({ seriesId: id }, 2);

    // Run 1 filled description/startYear/cover; run 2 finds nothing null and
    // writes nothing.
    expect(second.fieldsUpdated).toEqual([]);
  });

  it('no-ops for non-audiobook content type', async () => {
    const id = await makeAudiobook({ contentType: 'manga', description: null });
    const spy = vi.spyOn(itunes, 'searchAudiobooks');

    const result = await audiobookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(spy).not.toHaveBeenCalled();
    expect(result.fieldsUpdated).toEqual([]);
  });
});

describe('iTunes searchAudiobooks description mapping', () => {
  beforeEach(() => {
    // The outer beforeEach spies on searchAudiobooks; these tests exercise the
    // REAL client via the injectable fetcher, so undo the spy first.
    vi.restoreAllMocks();
  });
  afterEach(() => {
    itunes.__resetITunesForTests();
  });

  it('maps the `description` field from the search response', async () => {
    itunes.__setITunesFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          results: [
            {
              collectionId: 999,
              collectionName: 'The Old Kingdom',
              trackName: 'Sabriel',
              artistName: 'Garth Nix',
              artworkUrl100: 'https://itunes.example/100x100bb.jpg',
              releaseDate: '1995-09-30T07:00:00Z',
              description: 'A long synopsis from iTunes.',
            },
          ],
        }),
    }));

    const hits = await itunes.searchAudiobooks('Sabriel');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.description).toBe('A long synopsis from iTunes.');
    // Sanity: existing fields still map.
    expect(hits[0]!.releaseYear).toBe(1995);
    expect(hits[0]!.coverUrl).toBe('https://itunes.example/600x600bb.jpg');
  });

  it('defaults description to null when the API omits it', async () => {
    itunes.__setITunesFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          results: [{ collectionId: 1, collectionName: 'X', trackName: 'X' }],
        }),
    }));

    const hits = await itunes.searchAudiobooks('X');
    expect(hits[0]!.description).toBeNull();
  });
});

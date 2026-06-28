import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverResult } from '@/app/api/discover/search/route';
import { buildSeriesBody } from '@/components/add/quick-add';

// Mock the API layer so resolveAudiobook can be unit-tested without a server.
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-fetch';
import {
  needsAudiobookResolve,
  resolveAudiobook,
  applyResolvedAudiobook,
} from '@/components/add/audiobook-resolve';

const mockedFetch = vi.mocked(apiFetch);

const base = {
  year: null,
  author: 'Jane Austen',
  coverUrl: null,
  detail: null,
  inLib: false,
};

function nytResult(): DiscoverResult {
  return {
    ...base,
    contentType: 'audiobook',
    sourceId: 'nyt:9781234567890',
    title: 'Pride and Prejudice',
    isbn: '9781234567890',
    source: 'nyt',
  };
}

function librivoxResult(): DiscoverResult {
  return {
    ...base,
    contentType: 'audiobook',
    sourceId: 'librivox:1234',
    title: 'Pride and Prejudice',
    source: 'librivox',
  };
}

function audnexResult(): DiscoverResult {
  return {
    ...base,
    contentType: 'audiobook',
    sourceId: 'B00ASIN123',
    title: 'A Real Audible Book',
    source: 'audnex',
    sources: { audnex: 'B00ASIN123' },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('needsAudiobookResolve', () => {
  it('is true for nyt and librivox audiobook tiles', () => {
    expect(needsAudiobookResolve(nytResult())).toBe(true);
    expect(needsAudiobookResolve(librivoxResult())).toBe(true);
  });

  it('is false for audnex audiobook tiles and non-audiobook tiles', () => {
    expect(needsAudiobookResolve(audnexResult())).toBe(false);
    expect(
      needsAudiobookResolve({
        ...base,
        contentType: 'ebook',
        sourceId: 'OL1W',
        title: 'A Book',
        source: 'openlibrary',
      }),
    ).toBe(false);
  });
});

describe('resolveAudiobook', () => {
  it('calls the resolve endpoint with title+author and returns the top hit', async () => {
    mockedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            asin: 'B00RESOLVED',
            title: 'Pride and Prejudice (Audible)',
            author: 'Jane Austen',
            coverUrl: 'https://audible/cover.jpg',
          },
        }),
        { status: 200 },
      ),
    );

    const resolved = await resolveAudiobook(nytResult());
    expect(resolved).not.toBeNull();
    expect(resolved!.asin).toBe('B00RESOLVED');

    const calledUrl = mockedFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/api/discover/resolve-audiobook');
    expect(calledUrl).toContain('title=Pride+and+Prejudice');
    expect(calledUrl).toContain('author=Jane+Austen');
  });

  it('returns null when the endpoint reports no match', async () => {
    mockedFetch.mockResolvedValue(
      new Response(JSON.stringify({ result: null }), { status: 200 }),
    );
    expect(await resolveAudiobook(librivoxResult())).toBeNull();
  });

  it('throws when the endpoint fails', async () => {
    mockedFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'resolve failed' }), { status: 502 }),
    );
    await expect(resolveAudiobook(nytResult())).rejects.toThrow(/resolve failed/);
  });
});

describe('applyResolvedAudiobook → buildSeriesBody', () => {
  it('rewrites the tile to an audnex identity so the body carries the resolved asin', () => {
    const upgraded = applyResolvedAudiobook(nytResult(), {
      asin: 'B00RESOLVED',
      title: 'Pride and Prejudice (Audible)',
      author: 'Jane Austen',
      coverUrl: 'https://audible/cover.jpg',
    });
    expect(upgraded.source).toBe('audnex');
    expect(upgraded.sourceId).toBe('B00RESOLVED');
    expect(upgraded.sources?.audnex).toBe('B00RESOLVED');
    expect(upgraded.coverUrl).toBe('https://audible/cover.jpg');

    const body = buildSeriesBody(upgraded, { qualityProfileId: 5 });
    expect(body.contentType).toBe('audiobook');
    expect(body.asin).toBe('B00RESOLVED');
    expect(body.coverUrl).toBe('https://audible/cover.jpg');
  });

  it('keeps the original cover when the resolved hit has none (LibriVox has no cover)', () => {
    const upgraded = applyResolvedAudiobook(librivoxResult(), {
      asin: 'B00LV',
      title: 'Pride and Prejudice',
      author: 'Jane Austen',
      coverUrl: null,
    });
    expect(upgraded.sourceId).toBe('B00LV');
    expect(upgraded.coverUrl).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchReleases } from '@/server/integrations/github/client';

const ORIG_FETCH = global.fetch;

describe('fetchReleases', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
  });

  it('returns parsed releases on 200', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          tag_name: 'v0.2.0',
          name: 'v0.2.0',
          body: 'release notes',
          html_url: 'https://github.com/paulcsiki/bookkeeprr/releases/tag/v0.2.0',
          published_at: '2026-05-20T12:00:00Z',
          prerelease: false,
          draft: false,
        },
        {
          tag_name: 'v0.1.0',
          name: 'v0.1.0',
          body: 'first release',
          html_url: 'https://github.com/paulcsiki/bookkeeprr/releases/tag/v0.1.0',
          published_at: '2026-05-10T12:00:00Z',
          prerelease: false,
          draft: false,
        },
      ],
    });
    const rels = await fetchReleases(10);
    expect(rels).toHaveLength(2);
    expect(rels[0]!.tagName).toBe('v0.2.0');
    expect(rels[0]!.prerelease).toBe(false);
  });

  it('filters out drafts', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          tag_name: 'v0.3.0-draft',
          name: null,
          body: null,
          html_url: 'x',
          published_at: null,
          prerelease: false,
          draft: true,
        },
        {
          tag_name: 'v0.2.0',
          name: null,
          body: null,
          html_url: 'x',
          published_at: null,
          prerelease: false,
          draft: false,
        },
      ],
    });
    const rels = await fetchReleases(10);
    expect(rels).toHaveLength(1);
    expect(rels[0]!.tagName).toBe('v0.2.0');
  });

  it('throws rate-limited on 403', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: (k: string) => (k === 'x-ratelimit-reset' ? '1700000000' : null) },
      text: async () => 'rate limit exceeded',
    });
    await expect(fetchReleases(10)).rejects.toMatchObject({ code: 'rate-limited' });
  });

  it('throws http on 5xx', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    });
    await expect(fetchReleases(10)).rejects.toMatchObject({ code: 'http' });
  });
});

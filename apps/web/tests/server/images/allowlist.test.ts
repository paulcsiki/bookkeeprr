import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMAGE_HOSTS,
  isAllowlistedImageHost,
  isCfGatedImageHost,
  libraryCoverSrc,
} from '@/server/images/allowlist';

const COVER_HOSTS = [
  'uploads.mangadex.org',
  's4.anilist.co',
  'covers.openlibrary.org',
  'comicvine.gamespot.com',
  'm.media-amazon.com',
  'archive.org',
  'storage.googleapis.com',
  'cdn.novelupdates.com',
];

describe('isAllowlistedImageHost', () => {
  it.each(COVER_HOSTS)('allows the cover host %s', (host) => {
    expect(isAllowlistedImageHost(host)).toBe(true);
    expect(ALLOWED_IMAGE_HOSTS.has(host)).toBe(true);
  });

  it('rejects an arbitrary host', () => {
    expect(isAllowlistedImageHost('evil.example.com')).toBe(false);
    expect(isAllowlistedImageHost('mangadex.org')).toBe(false);
  });
});

describe('isCfGatedImageHost', () => {
  it('is true for the Cloudflare-gated NovelUpdates CDN', () => {
    expect(isCfGatedImageHost('cdn.novelupdates.com')).toBe(true);
  });

  it('is false for non-gated allowlisted hosts and arbitrary hosts', () => {
    expect(isCfGatedImageHost('uploads.mangadex.org')).toBe(false);
    expect(isCfGatedImageHost('s4.anilist.co')).toBe(false);
    expect(isCfGatedImageHost('evil.example.com')).toBe(false);
  });
});

describe('libraryCoverSrc', () => {
  const url = 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/x.jpg';

  it('rewrites an allowlisted https url to the proxy when caching is enabled', () => {
    expect(libraryCoverSrc(url, true)).toBe(`/api/img?u=${encodeURIComponent(url)}`);
  });

  it('passes the url through when caching is disabled', () => {
    expect(libraryCoverSrc(url, false)).toBe(url);
  });

  it('passes through a non-allowlisted host even when caching is enabled', () => {
    const other = 'https://example.com/cover.jpg';
    expect(libraryCoverSrc(other, true)).toBe(other);
  });

  it('passes through a non-https allowlisted host', () => {
    const http = 'http://uploads.mangadex.org/covers/a/b.jpg';
    expect(libraryCoverSrc(http, true)).toBe(http);
  });

  it('passes through an unparseable url', () => {
    expect(libraryCoverSrc('not a url', true)).toBe('not a url');
  });

  it('returns null/undefined/empty unchanged', () => {
    expect(libraryCoverSrc(null, true)).toBeNull();
    expect(libraryCoverSrc(undefined, true)).toBeUndefined();
    expect(libraryCoverSrc('', true)).toBe('');
  });
});

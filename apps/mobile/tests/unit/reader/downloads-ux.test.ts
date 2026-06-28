/**
 * Unit tests for the pure helpers added by the downloads-ux feature:
 *   - remainingNoun()  — content-type-aware button label noun
 *   - groupActiveDownloads()  — groups non-done store entries by series
 */

import { remainingNoun, groupActiveDownloads } from '@/screens/settings/Downloads';
import type { ContentType } from '@/api/schemas';
import type { DownloadEntry } from '@/state/readerDownloadsStore';

// ---------------------------------------------------------------------------
// remainingNoun
// ---------------------------------------------------------------------------

describe('remainingNoun', () => {
  it('returns "volumes" for manga', () => {
    expect(remainingNoun('manga')).toBe('volumes');
  });

  it('returns "volumes" for comic', () => {
    expect(remainingNoun('comic')).toBe('volumes');
  });

  it('returns "books" for novel', () => {
    expect(remainingNoun('novel')).toBe('books');
  });

  it('returns "books" for ebook', () => {
    expect(remainingNoun('ebook')).toBe('books');
  });

  it('returns "audiobooks" for audio', () => {
    expect(remainingNoun('audio')).toBe('audiobooks');
  });

  it('covers all ContentType values without falling through', () => {
    const types: ContentType[] = ['manga', 'comic', 'novel', 'ebook', 'audio'];
    for (const t of types) {
      expect(typeof remainingNoun(t)).toBe('string');
      expect(remainingNoun(t).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// groupActiveDownloads
// ---------------------------------------------------------------------------

function dl(state: DownloadEntry['state'], seriesName?: string, title?: string): DownloadEntry {
  const entry: DownloadEntry = {
    state,
    pct: state === 'downloading' ? 45 : 0,
    bytes: 0,
    contentType: 'manga',
    coverUrl: null,
  };
  if (seriesName !== undefined) entry.seriesName = seriesName;
  if (title !== undefined) entry.title = title;
  return entry;
}

describe('groupActiveDownloads', () => {
  it('returns an empty Map when there are no entries', () => {
    const groups = groupActiveDownloads({});
    expect(groups.size).toBe(0);
  });

  it('excludes done entries', () => {
    const groups = groupActiveDownloads({
      'page:file:1': dl('done', 'My Series'),
    });
    expect(groups.size).toBe(0);
  });

  it('includes queued entries', () => {
    const groups = groupActiveDownloads({
      'page:file:2': dl('queued', 'Series A'),
    });
    expect(groups.size).toBe(1);
    expect([...groups.values()][0]![0]!.readableKey).toBe('page:file:2');
  });

  it('includes downloading entries', () => {
    const groups = groupActiveDownloads({
      'page:file:3': dl('downloading', 'Series A'),
    });
    expect(groups.size).toBe(1);
  });

  it('includes error entries', () => {
    const groups = groupActiveDownloads({
      'page:file:4': dl('error', 'Series A'),
    });
    expect(groups.size).toBe(1);
  });

  it('groups multiple entries with the same seriesName under one key', () => {
    const groups = groupActiveDownloads({
      'page:file:10': dl('queued', 'Saga', 'Vol 1'),
      'page:file:11': dl('downloading', 'Saga', 'Vol 2'),
    });
    expect(groups.size).toBe(1);
    const items = groups.get('Saga')!;
    expect(items).toHaveLength(2);
    const keys = items.map((i) => i.readableKey);
    expect(keys).toContain('page:file:10');
    expect(keys).toContain('page:file:11');
  });

  it('puts entries with different seriesNames into separate groups', () => {
    const groups = groupActiveDownloads({
      'page:file:20': dl('queued', 'Series A'),
      'page:file:21': dl('queued', 'Series B'),
    });
    expect(groups.size).toBe(2);
    expect(groups.has('Series A')).toBe(true);
    expect(groups.has('Series B')).toBe(true);
  });

  it('falls back to title when seriesName is absent', () => {
    const groups = groupActiveDownloads({
      'page:file:30': dl('queued', undefined, 'Standalone Title'),
    });
    expect(groups.size).toBe(1);
    expect(groups.has('Standalone Title')).toBe(true);
  });

  it('falls back to the readableKey when both seriesName and title are absent', () => {
    const groups = groupActiveDownloads({
      'page:file:40': dl('queued', undefined, undefined),
    });
    expect(groups.size).toBe(1);
    expect(groups.has('page:file:40')).toBe(true);
  });

  it('does not include done alongside active in same map', () => {
    const groups = groupActiveDownloads({
      'page:file:50': dl('done', 'Series C'),
      'page:file:51': dl('downloading', 'Series C'),
    });
    // The done entry should be filtered out; only the downloading one remains.
    expect(groups.size).toBe(1);
    const items = groups.get('Series C')!;
    expect(items).toHaveLength(1);
    expect(items[0]!.readableKey).toBe('page:file:51');
  });

  it('preserves the entry in the result alongside its readableKey', () => {
    const entry = dl('downloading', 'Manga S', 'Vol 7');
    const groups = groupActiveDownloads({ 'page:file:99': entry });
    const item = groups.get('Manga S')![0]!;
    expect(item.readableKey).toBe('page:file:99');
    expect(item.entry).toBe(entry);
  });
});

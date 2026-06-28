import { describe, expect, it } from 'vitest';
import { buildIndexerInfoUrl } from '@/server/integrations/indexers';

describe('buildIndexerInfoUrl', () => {
  it('builds a Nyaa view URL from baseUrl + guid', () => {
    expect(buildIndexerInfoUrl('nyaa', 'https://nyaa.si', '12345')).toBe(
      'https://nyaa.si/view/12345',
    );
  });

  it('strips a trailing slash on baseUrl', () => {
    expect(buildIndexerInfoUrl('nyaa', 'https://nyaa.si/', '12345')).toBe(
      'https://nyaa.si/view/12345',
    );
  });

  it('returns null for an unknown indexer kind', () => {
    expect(buildIndexerInfoUrl('filelist', 'https://filelist.io', '12345')).toBeNull();
    expect(buildIndexerInfoUrl('mystery', 'https://example.com', '12345')).toBeNull();
  });
});

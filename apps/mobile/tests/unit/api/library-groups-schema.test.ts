import { LibraryGroup, LibraryGroupsResponse } from '@/api/schemas';
import { SeriesSummary, SeriesDetail } from '@/api/schemas';

describe('LibraryGroup schema', () => {
  const validGroup = {
    id: 1,
    name: 'Engineering',
    parentId: null,
    path: 'Engineering',
    seriesCount: 3,
    subgroupCount: 1,
  };

  it('parses a root group', () => {
    const g = LibraryGroup.parse(validGroup);
    expect(g.id).toBe(1);
    expect(g.parentId).toBeNull();
    expect(g.seriesCount).toBe(3);
  });

  it('parses a nested group', () => {
    const g = LibraryGroup.parse({ ...validGroup, id: 2, parentId: 1, path: 'Engineering / Architecture' });
    expect(g.parentId).toBe(1);
    expect(g.path).toBe('Engineering / Architecture');
  });

  it('rejects a group with missing required fields', () => {
    expect(() => LibraryGroup.parse({ id: 1, name: 'x' })).toThrow();
  });
});

describe('LibraryGroupsResponse schema', () => {
  it('parses a response with multiple groups', () => {
    const r = LibraryGroupsResponse.parse({
      groups: [
        { id: 1, name: 'Engineering', parentId: null, path: 'Engineering', seriesCount: 3, subgroupCount: 1 },
        { id: 2, name: 'Architecture', parentId: 1, path: 'Engineering / Architecture', seriesCount: 1, subgroupCount: 0 },
      ],
    });
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0]?.name).toBe('Engineering');
  });

  it('parses an empty groups array', () => {
    const r = LibraryGroupsResponse.parse({ groups: [] });
    expect(r.groups).toHaveLength(0);
  });

  it('rejects a bad group row (missing name)', () => {
    expect(() =>
      LibraryGroupsResponse.parse({
        groups: [{ id: 1, parentId: null, path: 'x', seriesCount: 0, subgroupCount: 0 }],
      }),
    ).toThrow();
  });
});

describe('SeriesSummary groupId/groupPath tolerance', () => {
  const base = {
    id: 1,
    title: 'Vinland Saga',
    contentType: 'manga',
    coverUrl: null,
    monitored: true,
    volumes: 25,
    downloaded: 20,
  };

  it('defaults groupId to null and groupPath to "" when absent', () => {
    const s = SeriesSummary.parse(base);
    expect(s.groupId).toBeNull();
    expect(s.groupPath).toBe('');
  });

  it('parses groupId and groupPath when present', () => {
    const s = SeriesSummary.parse({ ...base, groupId: 3, groupPath: 'Engineering' });
    expect(s.groupId).toBe(3);
    expect(s.groupPath).toBe('Engineering');
  });

  it('defaults groupId to null when sent as undefined', () => {
    const s = SeriesSummary.parse({ ...base, groupId: undefined });
    expect(s.groupId).toBeNull();
  });

  it('accepts groupId: null explicitly', () => {
    const s = SeriesSummary.parse({ ...base, groupId: null, groupPath: '' });
    expect(s.groupId).toBeNull();
  });
});

describe('SeriesDetail groupId/groupPath tolerance', () => {
  const base = {
    id: 1,
    title: 'Vinland Saga',
    contentType: 'manga',
    coverUrl: null,
    monitored: true,
    volumes: 25,
    downloaded: 20,
    description: null,
    author: null,
    startYear: null,
    volumesList: [],
  };

  it('defaults groupId to null and groupPath to "" when absent', () => {
    const s = SeriesDetail.parse(base);
    expect(s.groupId).toBeNull();
    expect(s.groupPath).toBe('');
  });

  it('parses groupId and groupPath when present', () => {
    const s = SeriesDetail.parse({ ...base, groupId: 2, groupPath: 'Sci-fi' });
    expect(s.groupId).toBe(2);
    expect(s.groupPath).toBe('Sci-fi');
  });
});

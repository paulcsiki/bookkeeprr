import {
  childrenOf,
  crumbChain,
  displayPath,
  descendantGroupIds,
  seriesUnderGroup,
  pickerOptions,
  type GroupNode,
} from '@/features/library/groups/lib';

const G: GroupNode[] = [
  { id: 1, name: 'Engineering', parentId: null, path: 'Engineering', seriesCount: 3, subgroupCount: 1 },
  { id: 2, name: 'Architecture', parentId: 1, path: 'Engineering / Architecture', seriesCount: 1, subgroupCount: 0 },
  { id: 3, name: 'To read 2025', parentId: null, path: 'To read 2025', seriesCount: 2, subgroupCount: 0 },
];

describe('library groups lib', () => {
  it('childrenOf returns alphabetical direct children', () => {
    expect(childrenOf(G, null).map((g) => g.id)).toEqual([1, 3]);
    expect(childrenOf(G, 1).map((g) => g.id)).toEqual([2]);
  });

  it('crumbChain walks root-first', () => {
    expect(crumbChain(G, 2).map((g) => g.name)).toEqual(['Engineering', 'Architecture']);
    expect(crumbChain(G, null)).toEqual([]);
  });

  it('displayPath falls back through unknown ids', () => {
    expect(displayPath(G, 2)).toBe('Engineering / Architecture');
    expect(displayPath(G, null)).toBe('');
    expect(displayPath(G, 999)).toBe('');
  });

  it('pickerOptions: root first, depth-indented preorder', () => {
    const opts = pickerOptions(G);
    expect(opts.map((o) => [o.id, o.depth, o.name])).toEqual([
      [null, 0, 'Library root'],
      [1, 0, 'Engineering'],
      [2, 1, 'Architecture'],
      [3, 0, 'To read 2025'],
    ]);
  });

  it('descendantGroupIds includes the node itself and all recursive children', () => {
    expect(descendantGroupIds(G, 1)).toEqual(new Set([1, 2]));
    expect(descendantGroupIds(G, 2)).toEqual(new Set([2]));
    expect(descendantGroupIds(G, 3)).toEqual(new Set([3]));
  });

  it('seriesUnderGroup picks recursive members in input order', () => {
    const series = [
      { id: 10, groupId: 2 },
      { id: 11, groupId: null },
      { id: 12, groupId: 1 },
      { id: 13, groupId: 3 },
    ];
    expect(seriesUnderGroup(series, G, 1).map((s) => s.id)).toEqual([10, 12]);
    expect(seriesUnderGroup(series, G, 2).map((s) => s.id)).toEqual([10]);
    expect(seriesUnderGroup(series, G, 3).map((s) => s.id)).toEqual([13]);
  });

  it('seriesUnderGroup never matches ungrouped rows', () => {
    const series = [{ id: 1, groupId: null }];
    expect(seriesUnderGroup(series, G, 1)).toEqual([]);
  });
});

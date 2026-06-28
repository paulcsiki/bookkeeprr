/**
 * Pure tree helpers for library groups.
 * No React, no side effects — safe to import in tests and server code.
 */

export interface GroupNode {
  id: number;
  name: string;
  parentId: number | null;
  path: string;
  seriesCount: number;
  subgroupCount: number;
}

export interface PickerOption {
  id: number | null;
  depth: number;
  name: string;
}

/** Direct children of `parentId`, sorted alphabetically. */
export function childrenOf(groups: GroupNode[], parentId: number | null): GroupNode[] {
  return groups
    .filter((g) => g.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Walk from root to `id`, returning the chain root-first.
 * Returns [] for null or unknown ids.
 */
export function crumbChain(groups: GroupNode[], id: number | null): GroupNode[] {
  if (id === null) return [];
  const map = new Map(groups.map((g) => [g.id, g]));
  const chain: GroupNode[] = [];
  let current = map.get(id);
  while (current !== undefined) {
    chain.unshift(current);
    current = current.parentId !== null ? map.get(current.parentId) : undefined;
  }
  // If the id wasn't found at all, chain is empty — correct.
  return chain;
}

/**
 * Returns the stored path string for a group, or '' for null/unknown.
 */
export function displayPath(groups: GroupNode[], id: number | null): string {
  if (id === null) return '';
  const node = groups.find((g) => g.id === id);
  return node?.path ?? '';
}

export interface FlatModeFilters {
  type: string;
  read: string;
  health: string;
  mon: string;
  q: string;
}

/**
 * Returns true when any filter is non-default or the search query is non-empty.
 * In flat mode, folders are hidden and all matches are shown with a group tag.
 */
export function flatModeActive(filters: FlatModeFilters): boolean {
  return (
    filters.type !== 'all' ||
    filters.read !== 'all' ||
    filters.health !== 'all' ||
    filters.mon !== 'all' ||
    filters.q.length > 0
  );
}

/**
 * Preorder DFS traversal of the group tree, alphabetical at each level.
 * Returns [{id: null, depth: 0, name: 'Library root'}, ...groups].
 */
export function pickerOptions(groups: GroupNode[]): PickerOption[] {
  const result: PickerOption[] = [{ id: null, depth: 0, name: 'Library root' }];

  function walk(parentId: number | null, depth: number): void {
    for (const g of childrenOf(groups, parentId)) {
      result.push({ id: g.id, depth, name: g.name });
      walk(g.id, depth + 1);
    }
  }

  walk(null, 0);
  return result;
}

/**
 * Series that live in `id` or any of its recursive subgroups, in input order.
 * Drives folder-card fan covers and the in-group recursive series count.
 */
export function seriesUnderGroup<T extends { id: number; groupId: number | null }>(
  series: T[],
  groups: GroupNode[],
  id: number,
): T[] {
  const ids = descendantGroupIds(groups, id);
  return series.filter((s) => s.groupId !== null && ids.has(s.groupId));
}

/**
 * Returns a Set containing `id` plus the ids of all recursive subgroups.
 * Used for fan cover derivation and delete-count calculations.
 */
export function descendantGroupIds(groups: GroupNode[], id: number): Set<number> {
  const result = new Set<number>();

  function walk(nodeId: number): void {
    result.add(nodeId);
    for (const child of childrenOf(groups, nodeId)) {
      walk(child.id);
    }
  }

  walk(id);
  return result;
}

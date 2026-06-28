import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from './client';
import { libraryGroups, series } from './schema';
import { deleteSeries, getSeries } from './series';
import { withWriteLock } from './write-lock';

export interface LibraryGroupRow {
  id: number;
  name: string;
  parentId: number | null;
  createdAt: Date;
}

export async function listGroups(): Promise<LibraryGroupRow[]> {
  return getDb().select().from(libraryGroups).orderBy(libraryGroups.name);
}

async function siblingExists(name: string, parentId: number | null, excludeId?: number) {
  const rows = await getDb()
    .select({ id: libraryGroups.id })
    .from(libraryGroups)
    .where(
      and(
        eq(libraryGroups.name, name),
        parentId === null ? isNull(libraryGroups.parentId) : eq(libraryGroups.parentId, parentId),
      ),
    );
  return rows.some((r) => r.id !== excludeId);
}

export async function createGroup(name: string, parentId: number | null): Promise<LibraryGroupRow> {
  if (parentId !== null) {
    const parent = await getGroup(parentId);
    if (!parent) throw new Error(`parent group ${parentId} does not exist`);
  }
  return withWriteLock(async () => {
    if (await siblingExists(name, parentId)) {
      throw new Error(`a group named '${name}' already exists here`);
    }
    const [row] = await getDb().insert(libraryGroups).values({ name, parentId }).returning();
    if (!row) throw new Error('createGroup: insert returned no row');
    return row;
  });
}

export async function getGroup(id: number): Promise<LibraryGroupRow | null> {
  const [row] = await getDb().select().from(libraryGroups).where(eq(libraryGroups.id, id));
  return row ?? null;
}

export async function renameGroup(id: number, name: string): Promise<void> {
  const g = await getGroup(id);
  if (!g) throw new Error(`group ${id} does not exist`);
  return withWriteLock(async () => {
    if (await siblingExists(name, g.parentId, id)) {
      throw new Error(`a group named '${name}' already exists here`);
    }
    await getDb().update(libraryGroups).set({ name }).where(eq(libraryGroups.id, id));
  });
}

export async function reparentGroup(id: number, parentId: number | null): Promise<void> {
  const g = await getGroup(id);
  if (!g) throw new Error(`group ${id} does not exist`);
  // Cycle guard: walking up from the new parent must never reach `id`.
  let cursor = parentId;
  while (cursor !== null) {
    if (cursor === id) throw new Error('reparent would create a cycle');
    const p = await getGroup(cursor);
    if (!p) throw new Error(`parent group ${cursor} does not exist`);
    cursor = p.parentId;
  }
  return withWriteLock(async () => {
    if (await siblingExists(g.name, parentId, id)) {
      throw new Error(`a group named '${g.name}' already exists here`);
    }
    await getDb().update(libraryGroups).set({ parentId }).where(eq(libraryGroups.id, id));
  });
}

/** Root-first display path, e.g. ['Engineering', 'Architecture']. */
export async function groupPath(id: number): Promise<string[]> {
  const parts: string[] = [];
  let cursor: number | null = id;
  while (cursor !== null) {
    const g = await getGroup(cursor);
    if (!g) break;
    parts.unshift(g.name);
    cursor = g.parentId;
  }
  return parts;
}

export async function moveSeriesToGroup(seriesId: number, groupId: number | null): Promise<void> {
  if (!(await getSeries(seriesId))) {
    throw new Error(`series ${seriesId} does not exist`);
  }
  if (groupId !== null && !(await getGroup(groupId))) {
    throw new Error(`group ${groupId} does not exist`);
  }
  return withWriteLock(async () => {
    await getDb().update(series).set({ groupId }).where(eq(series.id, seriesId));
  });
}

/** seriesCount RECURSIVE (incl. subgroups), subgroupCount direct children. */
export async function groupCounts(): Promise<Map<number, { seriesCount: number; subgroupCount: number }>> {
  const groups = await listGroups();
  const memberRows = await getDb()
    .select({ id: series.id, groupId: series.groupId })
    .from(series);
  const children = new Map<number | null, number[]>();
  for (const g of groups) {
    const list = children.get(g.parentId) ?? [];
    list.push(g.id);
    children.set(g.parentId, list);
  }
  const direct = new Map<number, number>();
  for (const r of memberRows) {
    if (r.groupId != null) direct.set(r.groupId, (direct.get(r.groupId) ?? 0) + 1);
  }
  const out = new Map<number, { seriesCount: number; subgroupCount: number }>();
  const recurse = (id: number): number => {
    const kids = children.get(id) ?? [];
    const total = (direct.get(id) ?? 0) + kids.reduce((s, k) => s + recurse(k), 0);
    out.set(id, { seriesCount: total, subgroupCount: kids.length });
    return total;
  };
  for (const g of groups.filter((g) => g.parentId === null)) recurse(g.id);
  return out;
}

/**
 * Recursive cascade (user-confirmed spec choice): deletes subgroups AND member
 * series records. Each series goes through deleteSeries so volumes/files/
 * downloads cascade exactly like a manual delete. Disk files untouched.
 */
export async function deleteGroupRecursive(
  id: number,
): Promise<{ deletedGroups: number; deletedSeries: number }> {
  const g = await getGroup(id);
  if (!g) throw new Error(`group ${id} does not exist`);
  const groups = await listGroups();
  const children = new Map<number | null, LibraryGroupRow[]>();
  for (const row of groups) {
    const list = children.get(row.parentId) ?? [];
    list.push(row);
    children.set(row.parentId, list);
  }
  const toDelete: number[] = [];
  const walk = (gid: number): void => {
    toDelete.push(gid);
    for (const child of children.get(gid) ?? []) walk(child.id);
  };
  walk(id);
  let deletedSeries = 0;
  for (const gid of toDelete) {
    const members = await getDb()
      .select({ id: series.id })
      .from(series)
      .where(eq(series.groupId, gid));
    for (const m of members) {
      await deleteSeries(m.id);
      deletedSeries += 1;
    }
  }
  // Group rows go atomically — children before parents. (Member series were
  // deleted via deleteSeries above for parity with manual deletes; a crash
  // between those deletes and this transaction leaves intact groups with
  // fewer members — re-running the delete converges. Never orphaned groups.)
  const db = getDb();
  await withWriteLock(() =>
    db.transaction((tx) => {
      tx.delete(libraryGroups).where(inArray(libraryGroups.id, toDelete)).run();
    }),
  );
  return { deletedGroups: toDelete.length, deletedSeries };
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import {
  createGroup, listGroups, renameGroup, reparentGroup, groupPath,
  moveSeriesToGroup, deleteGroupRecursive, groupCounts,
} from '@/server/db/library-groups';
import { getSeries, insertSeries } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb(); });
afterEach(() => h.cleanup());

async function mkSeries(title: string, groupId?: number | null): Promise<number> {
  return insertSeries({
    contentType: 'manga', anilistId: null, titleEnglish: title, status: 'releasing',
    rootPath: `/media/manga/${title}`, qualityProfileId: h.qpId,
    groupId: groupId ?? null,
  });
}

describe('library-groups DAL', () => {
  it('creates nested groups and computes paths', async () => {
    const eng = await createGroup('Engineering', null);
    const arch = await createGroup('Architecture', eng.id);
    expect(await groupPath(arch.id)).toEqual(['Engineering', 'Architecture']);
    expect(await groupPath(eng.id)).toEqual(['Engineering']);
  });

  it('rejects sibling-name duplicates, including at root (NULL parent)', async () => {
    await createGroup('Engineering', null);
    await expect(createGroup('Engineering', null)).rejects.toThrow(/exists/i);
    const eng = (await listGroups()).find((g) => g.name === 'Engineering')!;
    await createGroup('Sub', eng.id);
    await expect(createGroup('Sub', eng.id)).rejects.toThrow(/exists/i);
  });

  it('reparent rejects cycles', async () => {
    const a = await createGroup('A', null);
    const b = await createGroup('B', a.id);
    await expect(reparentGroup(a.id, b.id)).rejects.toThrow(/cycle/i);
    await expect(reparentGroup(a.id, a.id)).rejects.toThrow(/cycle/i);
  });

  it('rename respects sibling uniqueness', async () => {
    await createGroup('A', null);
    const b = await createGroup('B', null);
    await expect(renameGroup(b.id, 'A')).rejects.toThrow(/exists/i);
  });

  it('moves series in and out of groups', async () => {
    const g = await createGroup('To read 2025', null);
    const sid = await mkSeries('Chainsaw Man');
    await moveSeriesToGroup(sid, g.id);
    expect((await getSeries(sid))!.groupId).toBe(g.id);
    await moveSeriesToGroup(sid, null);
    expect((await getSeries(sid))!.groupId).toBeNull();
  });

  it('moveSeriesToGroup rejects unknown series', async () => {
    await expect(moveSeriesToGroup(999999, null)).rejects.toThrow(/does not exist/);
  });

  it('groupCounts: seriesCount recursive, subgroupCount direct', async () => {
    const eng = await createGroup('Engineering', null);
    const arch = await createGroup('Architecture', eng.id);
    await mkSeries('PHM', eng.id);
    await mkSeries('Piranesi', arch.id);
    const counts = await groupCounts();
    expect(counts.get(eng.id)).toEqual({ seriesCount: 2, subgroupCount: 1 });
    expect(counts.get(arch.id)).toEqual({ seriesCount: 1, subgroupCount: 0 });
  });

  it('deleteGroupRecursive removes subgroups + member series via deleteSeries', async () => {
    const eng = await createGroup('Engineering', null);
    const arch = await createGroup('Architecture', eng.id);
    const s1 = await mkSeries('PHM', eng.id);
    const s2 = await mkSeries('Piranesi', arch.id);
    const res = await deleteGroupRecursive(eng.id);
    expect(res).toEqual({ deletedGroups: 2, deletedSeries: 2 });
    expect(await getSeries(s1)).toBeNull();
    expect(await getSeries(s2)).toBeNull();
    expect(await listGroups()).toEqual([]);
  });
});

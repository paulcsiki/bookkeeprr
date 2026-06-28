import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { torrentCleanupSetting } from '@/server/db/settings/library';
import {
  housekeepingDescriptor,
  type HousekeepingResult,
} from '@/server/jobs/kinds/housekeeping';
import { enqueueJob, getJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';

let h: SeedHandle;
let tmpConfig: string;

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
  tmpConfig = mkdtempSync(join(tmpdir(), 'bk-hk-cfg-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpConfig;
  await qbtConnectionSetting.set({
    host: 'x',
    port: 1,
    username: 'u',
    password: 'p',
    useHttps: false,
  });
  __resetQbtForTests();
});

afterEach(() => {
  delete process.env.BOOKKEEPRR_CONFIG_DIR;
  __resetQbtForTests();
  h.cleanup();
  rmSync(tmpConfig, { recursive: true, force: true });
});

async function seedImportedDownload(hash: string): Promise<void> {
  const releaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: `g-${hash}`,
    seriesId: h.seriesId,
    title: 't',
    link: `magnet:?xt=urn:btih:${hash}`,
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    sizeBytes: 0,
    publishedAt: new Date(),
  });
  await insertDownload({ releaseId, qbtHash: hash, status: 'imported' });
}

type Torrent = { hash: string; ratio: number; seeding_time: number };

function mockQbt(torrents: Torrent[], deleteCalls: string[], failDelete?: Set<string>): void {
  __setQbtFetcherForTests(async (url, init) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    if (url.includes('/torrents/info')) {
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          JSON.stringify(
            torrents.map((t) => ({
              hash: t.hash,
              name: 'x',
              state: 'uploading',
              progress: 1,
              category: 'bookkeeprr-manga',
              tags: '',
              save_path: '/x',
              size: 100,
              completed: 100,
              ratio: t.ratio,
              seeding_time: t.seeding_time,
            })),
          ),
      };
    }
    if (url.includes('/torrents/delete')) {
      const body = new URLSearchParams(String(init?.body ?? ''));
      const hash = body.get('hashes') ?? '';
      deleteCalls.push(hash);
      if (failDelete?.has(hash)) {
        return { ok: false, status: 500, headers: {}, text: async () => '' };
      }
      return { ok: true, status: 200, headers: {}, text: async () => '' };
    }
    throw new Error(`unexpected ${url}`);
  });
}

async function runHousekeeping(): Promise<HousekeepingResult> {
  const id = await enqueueJob('housekeeping', {});
  await runOnce(housekeepingDescriptor);
  const job = await getJob(id);
  return JSON.parse(job!.resultJson!) as HousekeepingResult;
}

describe('housekeeping — torrent cleanup', () => {
  it('after_ratio removes only torrents at/over the ratio', async () => {
    await torrentCleanupSetting.set({ mode: 'after_ratio', ratio: 2, deleteFiles: false });
    await seedImportedDownload('low');
    await seedImportedDownload('exact');
    await seedImportedDownload('high');
    const deleteCalls: string[] = [];
    mockQbt(
      [
        { hash: 'low', ratio: 1.5, seeding_time: 0 },
        { hash: 'exact', ratio: 2, seeding_time: 0 },
        { hash: 'high', ratio: 3, seeding_time: 0 },
      ],
      deleteCalls,
    );

    const result = await runHousekeeping();
    expect(deleteCalls.sort()).toEqual(['exact', 'high']);
    expect(result.torrentsRemoved).toBe(2);
  });

  it('after_seed_time removes only torrents at/over seedMinutes*60 seconds', async () => {
    await torrentCleanupSetting.set({ mode: 'after_seed_time', seedMinutes: 60, deleteFiles: true });
    await seedImportedDownload('young');
    await seedImportedDownload('old');
    const deleteCalls: string[] = [];
    mockQbt(
      [
        { hash: 'young', ratio: 0, seeding_time: 60 * 60 - 1 }, // just under 1h
        { hash: 'old', ratio: 0, seeding_time: 60 * 60 }, // exactly 1h
      ],
      deleteCalls,
    );

    const result = await runHousekeeping();
    expect(deleteCalls).toEqual(['old']);
    expect(result.torrentsRemoved).toBe(1);
  });

  it('never removes nothing in housekeeping', async () => {
    await torrentCleanupSetting.set({ mode: 'never', deleteFiles: false });
    await seedImportedDownload('a');
    const deleteCalls: string[] = [];
    mockQbt([{ hash: 'a', ratio: 99, seeding_time: 99999 }], deleteCalls);

    const result = await runHousekeeping();
    expect(deleteCalls).toEqual([]);
    expect(result.torrentsRemoved).toBe(0);
  });

  it('after_import removes nothing in housekeeping (handled at import time)', async () => {
    await torrentCleanupSetting.set({ mode: 'after_import', deleteFiles: false });
    await seedImportedDownload('a');
    const deleteCalls: string[] = [];
    mockQbt([{ hash: 'a', ratio: 99, seeding_time: 99999 }], deleteCalls);

    const result = await runHousekeeping();
    expect(deleteCalls).toEqual([]);
    expect(result.torrentsRemoved).toBe(0);
  });

  it('collects per-hash delete errors without throwing', async () => {
    await torrentCleanupSetting.set({ mode: 'after_ratio', ratio: 1, deleteFiles: false });
    await seedImportedDownload('ok');
    await seedImportedDownload('boom');
    const deleteCalls: string[] = [];
    mockQbt(
      [
        { hash: 'ok', ratio: 2, seeding_time: 0 },
        { hash: 'boom', ratio: 2, seeding_time: 0 },
      ],
      deleteCalls,
      new Set(['boom']),
    );

    const result = await runHousekeeping();
    expect(deleteCalls.sort()).toEqual(['boom', 'ok']);
    // The successful one counts; the failure is reported, not thrown.
    expect(result.torrentsRemoved).toBe(1);
    expect(result.errors.some((e) => e.includes('boom'))).toBe(true);
  });

  it('skips imported downloads whose torrent is already gone from qBit', async () => {
    await torrentCleanupSetting.set({ mode: 'after_ratio', ratio: 1, deleteFiles: false });
    await seedImportedDownload('gone');
    const deleteCalls: string[] = [];
    mockQbt([], deleteCalls); // qBit returns no torrents

    const result = await runHousekeeping();
    expect(deleteCalls).toEqual([]);
    expect(result.torrentsRemoved).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

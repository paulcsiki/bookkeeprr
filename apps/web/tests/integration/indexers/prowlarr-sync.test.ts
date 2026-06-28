import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { syncProwlarr } from '@/server/indexers/prowlarr-sync';
import { prowlarrConnectionSetting } from '@/server/db/settings/prowlarr';
import {
  listIndexers,
  insertIndexer,
  parseIndexerConfig,
  getIndexer,
  updateIndexer,
} from '@/server/db/indexers';
import * as prowlarr from '@/server/integrations/prowlarr';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
  await prowlarrConnectionSetting.set({ url: 'http://prowlarr:9696', apiKey: 'KEY' });
});
afterEach(() => { h.cleanup(); vi.restoreAllMocks(); });

function mockRemote(list: { id: number; name: string; enable: boolean; categories: number[] }[]) {
  vi.spyOn(prowlarr, 'listProwlarrIndexers').mockResolvedValue(list);
}

describe('syncProwlarr', () => {
  it('adds new managed torznab rows', async () => {
    mockRemote([{ id: 1, name: 'Books', enable: true, categories: [7020] }]);
    const r = await syncProwlarr();
    expect(r).toEqual({ added: 1, updated: 0, disabled: 0 });
    const rows = await listIndexers();
    const row = rows.find((x) => x.kind === 'torznab')!;
    expect(row.baseUrl).toBe('http://prowlarr:9696/1/api');
    const cfg = parseIndexerConfig(row.configJson, 'torznab');
    if (cfg.kind === 'torznab') {
      expect(cfg.prowlarrIndexerId).toBe(1);
      expect(cfg.apiKey).toBe('KEY');
      expect(cfg.categoryByContentType).toEqual({ ebook: '7020', light_novel: '7020' });
    }
  });

  it('is idempotent on second run', async () => {
    mockRemote([{ id: 1, name: 'Books', enable: true, categories: [7020] }]);
    await syncProwlarr();
    const second = await syncProwlarr();
    expect(second).toEqual({ added: 0, updated: 1, disabled: 0 }); // update is a no-op rewrite
    expect((await listIndexers()).filter((x) => x.kind === 'torznab')).toHaveLength(1);
  });

  it('disables a managed row whose prowlarr indexer disappeared', async () => {
    mockRemote([{ id: 1, name: 'Books', enable: true, categories: [7020] }]);
    await syncProwlarr();
    const id = (await listIndexers()).find((x) => x.kind === 'torznab')!.id;
    mockRemote([]); // gone from prowlarr
    const r = await syncProwlarr();
    expect(r.disabled).toBe(1);
    expect((await getIndexer(id))!.enabled).toBe(false);
  });

  it('re-enables a managed row that reappears enabled', async () => {
    mockRemote([{ id: 1, name: 'Books', enable: true, categories: [7020] }]);
    await syncProwlarr();
    const id = (await listIndexers()).find((x) => x.kind === 'torznab')!.id;
    mockRemote([]); await syncProwlarr(); // disabled
    mockRemote([{ id: 1, name: 'Books', enable: true, categories: [7020] }]);
    await syncProwlarr();
    expect((await getIndexer(id))!.enabled).toBe(true);
  });

  it('preserves a user-edited pollIntervalSeconds across re-sync', async () => {
    mockRemote([{ id: 1, name: 'Books', enable: true, categories: [7020] }]);
    await syncProwlarr();
    const row = (await listIndexers()).find((x) => x.kind === 'torznab')!;
    const cfg0 = parseIndexerConfig(row.configJson, 'torznab');
    if (cfg0.kind !== 'torznab') throw new Error('expected torznab');
    // User changes the poll interval via the edit sheet.
    await updateIndexer(row.id, { configJson: { ...cfg0, pollIntervalSeconds: 1800 } });

    mockRemote([{ id: 1, name: 'Books', enable: true, categories: [7020] }]);
    await syncProwlarr();
    const cfg1 = parseIndexerConfig((await getIndexer(row.id))!.configJson, 'torznab');
    if (cfg1.kind !== 'torznab') throw new Error('expected torznab');
    expect(cfg1.pollIntervalSeconds).toBe(1800); // not reset to 900
  });

  it('leaves a manual (non-managed) torznab row untouched', async () => {
    const manualId = await insertIndexer({
      kind: 'torznab', name: 'Manual', baseUrl: 'http://x/api', enabled: true,
      configJson: { kind: 'torznab', queryTemplate: '{title}', contentTypes: ['ebook'], categoryByContentType: { ebook: '7020' }, apiKey: 'M', pollIntervalSeconds: 900 },
    });
    mockRemote([]);
    await syncProwlarr();
    expect((await getIndexer(manualId))!.enabled).toBe(true);
  });
});

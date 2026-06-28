import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertIndexer, updateIndexerLastRssAt } from '@/server/db/indexers';
import { indexerPollFanoutDescriptor } from '@/server/jobs/kinds/indexer-poll-fanout';
import * as runner from '@/server/jobs/runner';

let h: SeedHandle;
let tmpConfig: string;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  tmpConfig = mkdtempSync(join(tmpdir(), 'bk-fanout-cfg-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpConfig;
});
afterEach(() => {
  delete process.env.BOOKKEEPRR_CONFIG_DIR;
  h.cleanup();
  rmSync(tmpConfig, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const NYAA_CFG = {
  kind: 'nyaa' as const,
  queryTemplate: '{title}',
  contentTypes: ['manga' as const],
  categoryByContentType: { manga: '3_1' as const },
  pollIntervalSeconds: 900,
};

describe('indexerPollFanoutDescriptor', () => {
  it('enqueues never-polled indexer (lastRssAt null)', async () => {
    const id = await insertIndexer({
      kind: 'nyaa',
      name: 'never-polled',
      baseUrl: 'https://example.test',
      enabled: true,
      configJson: NYAA_CFG,
    });
    vi.spyOn(runner, 'runUntilIdle').mockResolvedValue(0);

    const r = await indexerPollFanoutDescriptor.handler({}, 1);
    expect(r.enabledCount).toBeGreaterThanOrEqual(1);
    expect(r.dueCount).toBeGreaterThanOrEqual(1);
    expect(r.enqueuedIds).toContain(id);
  });

  it('does not enqueue a recently-polled indexer (lastRssAt < interval)', async () => {
    const id = await insertIndexer({
      kind: 'nyaa',
      name: 'recent',
      baseUrl: 'https://example.test',
      enabled: true,
      configJson: { ...NYAA_CFG, pollIntervalSeconds: 900 },
    });
    await updateIndexerLastRssAt(id, new Date(Date.now() - 60_000));
    vi.spyOn(runner, 'runUntilIdle').mockResolvedValue(0);

    const r = await indexerPollFanoutDescriptor.handler({}, 1);
    expect(r.enqueuedIds).not.toContain(id);
  });

  it('enqueues a stale indexer (lastRssAt > interval)', async () => {
    const id = await insertIndexer({
      kind: 'nyaa',
      name: 'stale',
      baseUrl: 'https://example.test',
      enabled: true,
      configJson: { ...NYAA_CFG, pollIntervalSeconds: 900 },
    });
    await updateIndexerLastRssAt(id, new Date(Date.now() - 30 * 60_000));
    vi.spyOn(runner, 'runUntilIdle').mockResolvedValue(0);

    const r = await indexerPollFanoutDescriptor.handler({}, 1);
    expect(r.enqueuedIds).toContain(id);
  });

  it('respects per-indexer pollIntervalSeconds override', async () => {
    const id = await insertIndexer({
      kind: 'nyaa',
      name: 'fast-poller',
      baseUrl: 'https://example.test',
      enabled: true,
      configJson: { ...NYAA_CFG, pollIntervalSeconds: 60 },
    });
    await updateIndexerLastRssAt(id, new Date(Date.now() - 2 * 60_000));
    vi.spyOn(runner, 'runUntilIdle').mockResolvedValue(0);

    const r = await indexerPollFanoutDescriptor.handler({}, 1);
    expect(r.enqueuedIds).toContain(id);
  });

  it('skips disabled indexers regardless of last-run', async () => {
    const id = await insertIndexer({
      kind: 'nyaa',
      name: 'disabled',
      baseUrl: 'https://example.test',
      enabled: false,
      configJson: NYAA_CFG,
    });
    vi.spyOn(runner, 'runUntilIdle').mockResolvedValue(0);

    const r = await indexerPollFanoutDescriptor.handler({}, 1);
    expect(r.enqueuedIds).not.toContain(id);
  });

  it('drains the indexer_poll queue after enqueue', async () => {
    await insertIndexer({
      kind: 'nyaa',
      name: 'drain-test',
      baseUrl: 'https://example.test',
      enabled: true,
      configJson: NYAA_CFG,
    });
    const spy = vi.spyOn(runner, 'runUntilIdle').mockResolvedValue(0);

    await indexerPollFanoutDescriptor.handler({}, 1);

    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]![0];
    expect((arg as { kind: string }).kind).toBe('indexer_poll');
  });
});

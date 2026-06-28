import type { ContentType } from '@/server/content-type';
import type { TorznabConfig } from '@/server/integrations/indexers/types';
import { listIndexers, insertIndexer, updateIndexer, parseIndexerConfig } from '@/server/db/indexers';
import { listProwlarrIndexers, type ProwlarrIndexer } from '@/server/integrations/prowlarr';
import { prowlarrConnectionSetting, isProwlarrConfigured } from '@/server/db/settings/prowlarr';
import { logger } from '@/server/logger';

/** Newznab subcat id → content types it satisfies. */
const CATEGORY_MAP: { cat: string; types: ContentType[] }[] = [
  { cat: '7020', types: ['ebook', 'light_novel'] },
  { cat: '7030', types: ['comic', 'manga'] },
  { cat: '3030', types: ['audiobook'] },
];

export function deriveContentTypeCategories(categories: number[]): Partial<Record<ContentType, string>> {
  const set = new Set(categories.map(String));
  const out: Partial<Record<ContentType, string>> = {};
  for (const { cat, types } of CATEGORY_MAP) {
    if (set.has(cat)) for (const t of types) out[t] = cat;
  }
  return out;
}

export type ProwlarrSyncResult = { added: number; updated: number; disabled: number };

const DEFAULT_POLL_INTERVAL_SECONDS = 900;

function buildConfig(
  conn: { apiKey: string },
  ix: ProwlarrIndexer,
  pollIntervalSeconds: number = DEFAULT_POLL_INTERVAL_SECONDS,
): TorznabConfig {
  const categoryByContentType = deriveContentTypeCategories(ix.categories);
  return {
    kind: 'torznab',
    queryTemplate: '{title} {extra}',
    contentTypes: Object.keys(categoryByContentType) as ContentType[],
    categoryByContentType,
    apiKey: conn.apiKey,
    pollIntervalSeconds,
    prowlarrIndexerId: ix.id,
  };
}

export async function syncProwlarr(): Promise<ProwlarrSyncResult> {
  const log = logger().child({ component: 'prowlarr_sync' });
  const conn = await prowlarrConnectionSetting.get();
  if (!isProwlarrConfigured(conn)) throw new Error('prowlarr not configured');

  const remote = await listProwlarrIndexers(conn);
  const remoteById = new Map(remote.map((r) => [r.id, r]));

  const rows = await listIndexers();
  // Managed rows: torznab rows whose config carries a prowlarrIndexerId.
  const managed = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.kind !== 'torznab') continue;
    const cfg = parseIndexerConfig(row.configJson, 'torznab');
    if (cfg.kind === 'torznab' && cfg.prowlarrIndexerId !== undefined) managed.set(cfg.prowlarrIndexerId, row);
  }

  const base = conn.url.replace(/\/$/, '');
  let added = 0, updated = 0, disabled = 0;

  for (const ix of remote) {
    try {
      const baseUrl = `${base}/${ix.id}/api`;
      const existing = managed.get(ix.id);
      if (existing) {
        // Preserve the user's poll interval (a bookkeeprr-local setting, not
        // derived from Prowlarr) across re-syncs; only categories/name/url and
        // enable-on-reappear are Prowlarr-owned.
        const existingCfg = parseIndexerConfig(existing.configJson, 'torznab');
        const pollIntervalSeconds =
          existingCfg.kind === 'torznab'
            ? existingCfg.pollIntervalSeconds
            : DEFAULT_POLL_INTERVAL_SECONDS;
        const cfg = buildConfig(conn, ix, pollIntervalSeconds);
        await updateIndexer(existing.id, {
          name: ix.name,
          baseUrl,
          configJson: cfg,
          // Re-enable a previously auto-disabled row only when Prowlarr has it enabled.
          ...(ix.enable && !existing.enabled ? { enabled: true } : {}),
        });
        updated++;
      } else {
        const cfg = buildConfig(conn, ix);
        await insertIndexer({ kind: 'torznab', name: ix.name, baseUrl, enabled: ix.enable, configJson: cfg });
        added++;
      }
    } catch (err) {
      log.warn({ prowlarrId: ix.id, err: (err as Error).message }, 'prowlarr sync: indexer failed; continuing');
    }
  }

  // Disable managed rows whose Prowlarr indexer is gone or disabled there.
  for (const [pid, row] of managed) {
    const r = remoteById.get(pid);
    if ((r === undefined || r.enable === false) && row.enabled) {
      await updateIndexer(row.id, { enabled: false });
      disabled++;
    }
  }

  log.info({ added, updated, disabled }, 'prowlarr sync complete');
  return { added, updated, disabled };
}

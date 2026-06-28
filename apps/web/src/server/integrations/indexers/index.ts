import { searchNyaa } from '@/server/integrations/nyaa/client';
import type { NyaaRssItem } from '@/server/integrations/nyaa/schemas';
import { searchFilelist } from '@/server/integrations/filelist/client';
import { searchTorznab } from '@/server/integrations/torznab';
import { searchMam } from '@/server/integrations/mam';
import type { IndexerRow } from '@/server/db/schema';
import type { IndexerConfig, IndexerQuery, IndexerResult } from './types';

export type { IndexerKind, IndexerConfig, IndexerQuery, IndexerResult } from './types';

/**
 * Builds the indexer's human-facing details/info page URL for a result, derived
 * from the indexer's `baseUrl` + the item `guid`, per indexer kind. Returns
 * `null` for kinds we don't know how to map. Extend the switch as new kinds are
 * added.
 */
export function buildIndexerInfoUrl(
  kind: string,
  baseUrl: string,
  guid: string,
): string | null {
  switch (kind) {
    case 'nyaa':
      return `${baseUrl.replace(/\/$/, '')}/view/${guid}`;
    case 'mam':
      return `${baseUrl.replace(/\/$/, '')}/t/${guid}`;
    default:
      return null;
  }
}

export function nyaaItemToResult(item: NyaaRssItem): IndexerResult {
  return {
    guid: item.guid,
    title: item.title,
    link: item.link,
    sizeBytes: item.sizeBytes,
    seeders: item.seeders,
    leechers: item.leechers,
    pubDate: item.pubDate,
    infoHash: item.infoHash,
    category: item.categoryId,
    trusted: item.trusted,
    remake: item.remake,
  };
}

export async function searchIndexer(
  indexer: IndexerRow,
  cfg: IndexerConfig,
  query: IndexerQuery,
): Promise<IndexerResult[]> {
  switch (cfg.kind) {
    case 'nyaa': {
      const category = String(query.category);
      if (category !== '3_1' && category !== '3_3') {
        throw new Error(`searchIndexer(nyaa): invalid category ${category}`);
      }
      // Honour the indexer row's baseUrl so users can point at a Nyaa mirror
      // (and so e2e tests can point at a mock service).
      const items = await searchNyaa({ q: query.q, category }, indexer.baseUrl);
      return items.map(nyaaItemToResult);
    }
    case 'filelist': {
      const category = Number(query.category);
      if (!Number.isFinite(category)) {
        throw new Error(`searchIndexer(filelist): invalid category ${query.category}`);
      }
      return searchFilelist(
        { username: cfg.username, passkey: cfg.passkey },
        { q: query.q, category },
      );
    }
    case 'torznab': {
      return searchTorznab({
        url: indexer.baseUrl,
        apiKey: cfg.apiKey,
        q: query.q,
        cat: String(query.category),
      });
    }
    case 'mam': {
      const mainCat = Number(query.category);
      if (!Number.isFinite(mainCat)) {
        throw new Error(`searchIndexer(mam): invalid category ${query.category}`);
      }
      return searchMam(
        { mamId: cfg.mamId, proxyUrl: cfg.proxyUrl, searchIn: cfg.searchIn },
        { q: query.q, mainCat },
        indexer.baseUrl,
      );
    }
    case 'manual':
      // The Manual sentinel is never searched — it only holds adopted torrents.
      return [];
  }
}

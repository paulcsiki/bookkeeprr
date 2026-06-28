import { searchNovelCached } from '@/server/integrations/anilist/cache';
import { searchNovelUpdates } from '@/server/integrations/novelupdates';
import type { SearchHit } from '@/server/integrations/anilist/schemas';
import type { NuSearchHit } from '@/server/integrations/novelupdates';
import { logger } from '@/server/logger';

export type NovelComposed = {
  aniList: SearchHit[];
  novelUpdates: NuSearchHit[];
};

export async function composeNovelMetadata(query: string): Promise<NovelComposed> {
  const log = logger().child({ component: 'metadata.light-novel' });
  const [aniListResult, nuResult] = await Promise.allSettled([
    searchNovelCached(query),
    searchNovelUpdates(query),
  ]);
  let aniList: SearchHit[];
  if (aniListResult.status === 'fulfilled') {
    aniList = aniListResult.value;
  } else {
    log.warn({ err: aniListResult.reason }, 'anilist novel search failed');
    aniList = [];
  }
  let novelUpdates: NuSearchHit[];
  if (nuResult.status === 'fulfilled') {
    novelUpdates = nuResult.value;
  } else {
    log.warn({ err: nuResult.reason }, 'novelupdates search failed');
    novelUpdates = [];
  }
  return { aniList, novelUpdates };
}

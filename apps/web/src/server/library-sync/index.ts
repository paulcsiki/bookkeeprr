import { logger } from '@/server/logger';
import {
  audiobookshelfSetting,
  isAudiobookshelfConfigured,
} from '@/server/db/settings/audiobookshelf';
import { calibreSetting, isCalibreConfigured } from '@/server/db/settings/calibre';
import { scanLibrary } from './audiobookshelf';
import { refreshLibrary } from './calibre';
import type { ContentType } from '@/server/content-type';

export async function triggerRefresh(contentType: ContentType): Promise<void> {
  const log = logger().child({ component: 'library-sync', contentType });

  const ab = await audiobookshelfSetting.get();
  if (isAudiobookshelfConfigured(ab) && ab.contentTypes.includes(contentType)) {
    try {
      await scanLibrary({ baseUrl: ab.baseUrl!, apiToken: ab.apiToken! }, ab.libraryId!);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'audiobookshelf scan failed');
    }
  }

  const cb = await calibreSetting.get();
  if (isCalibreConfigured(cb) && cb.contentTypes.includes(contentType)) {
    try {
      await refreshLibrary(
        { baseUrl: cb.baseUrl!, username: cb.username, password: cb.password },
        cb.libraryId,
      );
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'calibre refresh failed');
    }
  }
}

export async function safeTriggerRefresh(downloadId: number): Promise<void> {
  try {
    const { getDownload } = await import('@/server/db/downloads');
    const { getRelease } = await import('@/server/db/releases');
    const { getSeries } = await import('@/server/db/series');
    const dl = await getDownload(downloadId);
    if (!dl) return;
    const release = await getRelease(dl.releaseId);
    if (!release || release.seriesId === null) return;
    const series = await getSeries(release.seriesId);
    if (!series) return;
    await triggerRefresh(series.contentType);
  } catch (err) {
    logger()
      .child({ component: 'library-sync' })
      .warn({ err: (err as Error).message }, 'safeTriggerRefresh failed');
  }
}

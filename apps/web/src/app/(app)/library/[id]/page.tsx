import { notFound } from 'next/navigation';
import { getSeries } from '@/server/db/series';
import { listVolumesBySeries } from '@/server/db/volumes';
import { listChaptersBySeries } from '@/server/db/chapters';
import { listLibraryFilesBySeries } from '@/server/db/library-files';
import { listQualityProfiles } from '@/server/db/quality-profiles';
import { imageCacheSetting } from '@/server/db/settings/library';
import { getActor } from '@/server/auth/get-actor';
import { listReadChapterIds } from '@/server/db/chapter-read';
import { getSeriesResume, getVolumeReadStates } from '@/server/db/reading-progress';
import { getBookSeriesForTitle } from '@/server/db/book-series';
import { SeriesDetail } from './SeriesDetail';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function SeriesDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { id } = await params;
  const seriesId = Number(id);
  if (!Number.isInteger(seriesId) || seriesId <= 0) notFound();

  const series = await getSeries(seriesId);
  if (!series) notFound();

  const [volumes, chapters, libraryFiles, profiles, actor, imageCache, bookSeries] = await Promise.all([
    listVolumesBySeries(seriesId),
    listChaptersBySeries(seriesId),
    listLibraryFilesBySeries(seriesId),
    listQualityProfiles(),
    getActor(),
    imageCacheSetting.get(),
    (series.contentType === 'ebook' || series.contentType === 'audiobook')
      ? getBookSeriesForTitle(seriesId)
      : null,
  ]);

  const isAdmin = actor?.role === 'admin';

  const readChapterIds = actor ? await listReadChapterIds(actor.userId, seriesId) : new Set<number>();
  const resume = actor ? await getSeriesResume(actor.userId, seriesId) : null;
  const volumeReadStates = actor
    ? await getVolumeReadStates(actor.userId, seriesId)
    : new Map<number, 'unread' | 'reading' | 'finished'>();

  return (
    <SeriesDetail
      series={series}
      volumes={volumes}
      chapters={chapters}
      libraryFiles={libraryFiles}
      qualityProfiles={profiles}
      isAdmin={isAdmin}
      cacheEnabled={imageCache.enabled}
      readChapterIds={readChapterIds}
      resumeReadableKey={resume?.readableKey ?? null}
      volumeReadStates={Array.from(volumeReadStates.entries())}
      bookSeries={bookSeries}
    />
  );
}

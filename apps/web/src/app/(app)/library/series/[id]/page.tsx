import { notFound } from 'next/navigation';
import { getBookSeries } from '@/server/db/book-series';
import { mergeBooks } from '@/server/db/book-series-view';
import { imageCacheSetting } from '@/server/db/settings/library';
import { getActor } from '@/server/auth/get-actor';
import { BookSeriesDetailView } from './BookSeriesDetail';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function BookSeriesPage({ params }: Props): Promise<React.JSX.Element> {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getBookSeries(id);
  if (!detail) notFound();

  const [imageCache, actor] = await Promise.all([
    imageCacheSetting.get(),
    getActor(),
  ]);

  const books = mergeBooks(detail);
  const { bookSeries, members } = detail;

  const coverUrl = bookSeries.coverUrl ?? members[0]?.series.coverUrl ?? null;

  return (
    <BookSeriesDetailView
      id={bookSeries.id}
      name={bookSeries.name}
      contentType={bookSeries.contentType}
      coverUrl={coverUrl}
      totalBooks={bookSeries.totalBooks}
      memberCount={members.length}
      description={bookSeries.description}
      books={books}
      isAdmin={actor?.role === 'admin'}
      cacheEnabled={imageCache.enabled}
    />
  );
}

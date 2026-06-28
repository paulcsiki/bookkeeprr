import Link from 'next/link';
import { ContentTypePill } from '@/components/ContentTypePill';
import { Cover } from '@/components/Cover';
import { libraryCoverSrc } from '@/server/images/allowlist';
import type { BookSeriesRow } from '@/server/db/schema';

type Props = {
  bookSeries: BookSeriesRow & { memberCount: number };
  /** When set, a label surfaced by search — e.g. "The Subtle Knife" — is shown under the cover. */
  matchedTitle?: string;
  /** When true, route cover URLs through the caching `/api/img` proxy. */
  cacheEnabled?: boolean;
};

/**
 * Book-series card — a Seerr-style collection card that collapses member
 * titles into a single entry in the library grid. Mirrors the `.lib-card`
 * pattern of SeriesCard, with an additional `book-series` class for the
 * stacked-spine visual (see globals.css `.lib-card.book-series`).
 *
 * Links to `/library/series/${id}` (Task 13 will build that route).
 * Token reference: docs/design/bookkeeprr-design-system.html lines 589-664.
 */
export function BookSeriesCard({
  bookSeries,
  matchedTitle,
  cacheEnabled = false,
}: Props): React.JSX.Element {
  const booksText = `SERIES · ${bookSeries.memberCount} ${bookSeries.memberCount === 1 ? 'BOOK' : 'BOOKS'}`;
  const coverSrc = libraryCoverSrc(bookSeries.coverUrl, cacheEnabled);

  return (
    <Link
      href={`/library/series/${bookSeries.id}`}
      className="lib-card book-series"
      data-testid={`book-series-card-${bookSeries.id}`}
    >
      {/* Cover with stacked spine effect */}
      <div className="cover">
        <Cover
          className="absolute inset-0"
          src={coverSrc}
          contentType={bookSeries.contentType}
          title={bookSeries.name}
          alt={bookSeries.name}
          hideType
        />

        {/* Content type pill — top-left */}
        <span className="badge-top">
          <ContentTypePill type={bookSeries.contentType} />
        </span>
      </div>

      {/* Meta */}
      <div className="meta">
        <div className="title" title={bookSeries.name}>
          {bookSeries.name}
        </div>
        <div className="sub">{booksText}</div>
        {matchedTitle && (
          <div className="matched-title" title={matchedTitle}>
            {matchedTitle}
          </div>
        )}
      </div>
    </Link>
  );
}

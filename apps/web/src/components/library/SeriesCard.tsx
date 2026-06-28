import Link from 'next/link';
import { Folder } from 'lucide-react';
import { ContentTypePill } from '@/components/ContentTypePill';
import { Cover } from '@/components/Cover';
import { acquisitionState } from '@/lib/acquisition';
import { libraryCoverSrc } from '@/server/images/allowlist';
import type { SeriesRow } from '@/server/db/schema';
import type { AcquisitionCounts } from '@/server/db/series';

type Props = {
  series: SeriesRow;
  acquisition?: AcquisitionCounts;
  cacheEnabled?: boolean;
  /** Group display path shown as the grp-tag under the meta (flat mode). */
  groupTag?: string;
  /** Native HTML5 dnd — set by the library grid in browse mode. */
  draggable?: boolean;
  onDragStart?: React.DragEventHandler;
};

const ACQ_LABEL = {
  missing: 'Missing',
  partial: 'Partial',
  complete: 'Complete',
} as const;

/**
 * Series card — matches design's `.lib-card` pattern exactly.
 * Cover: aspect 2/3, gradient bg, hatching overlay, hover translateY -3px
 * + primary-line border + shadow. Meta: 13.5px title + 10.5px mono sub.
 * Token reference: docs/design/bookkeeprr-design-system.html lines 589-664.
 */
export function SeriesCard({
  series,
  acquisition,
  cacheEnabled = false,
  groupTag,
  draggable,
  onDragStart,
}: Props): React.JSX.Element {
  const title =
    series.titleEnglish ?? series.titleRomaji ?? series.titleNative ?? `Series #${series.id}`;
  const volText = series.totalVolumes !== null ? `vol ${series.totalVolumes}` : null;
  const acq = acquisitionState(acquisition?.owned ?? 0, acquisition?.total ?? 0);
  const coverSrc = libraryCoverSrc(series.coverUrl, cacheEnabled);

  return (
    <Link
      href={`/library/${series.id}`}
      className="lib-card"
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {/* Cover */}
      <div className="cover">
        <Cover
          className="absolute inset-0"
          src={coverSrc}
          contentType={series.contentType}
          title={title}
          alt={title}
          hideType
        />

        {/* Content type pill — top-left */}
        <span className="badge-top">
          <ContentTypePill type={series.contentType} />
        </span>

        {/* Status badge — top-right */}
        <span
          className={`badge-status ${
            series.status === 'releasing'
              ? 'ok'
              : series.status === 'hiatus'
                ? 'warn'
                : series.status === 'cancelled'
                  ? 'err'
                  : ''
          }`}
          aria-label={series.status}
        >
          <span
            className="inline-block rounded-full"
            style={{
              width: 6,
              height: 6,
              background:
                series.status === 'releasing'
                  ? 'var(--color-ok)'
                  : series.status === 'hiatus'
                    ? 'var(--color-warn)'
                    : series.status === 'cancelled'
                      ? 'var(--color-err)'
                      : 'var(--color-foreground)',
            }}
          />
        </span>

        {/* Acquisition pill — bottom-left */}
        <span className={`badge-acq ${acq}`} aria-label={`Acquisition: ${ACQ_LABEL[acq]}`}>
          {ACQ_LABEL[acq]}
        </span>
      </div>

      {/* Meta */}
      <div className="meta">
        <div className="title" title={title}>
          {title}
        </div>
        {volText && <div className="sub">{volText}</div>}
        {groupTag && (
          <div className="grp-tag">
            <Folder size={11} strokeWidth={1.7} aria-hidden />
            {groupTag}
          </div>
        )}
      </div>
    </Link>
  );
}

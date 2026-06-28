'use client';

import Link from 'next/link';
import { ContentTypePill } from '@/components/ContentTypePill';
import { Cover } from '@/components/Cover';
import { acquisitionState } from '@/lib/acquisition';
import { formatBytes } from '@/lib/format';
import { libraryCoverSrc } from '@/server/images/allowlist';
import type { SeriesRow } from '@/server/db/schema';
import type { AcquisitionCounts } from '@/server/db/series';

type Props = {
  series: SeriesRow[];
  acquisition?: Map<number, AcquisitionCounts>;
  /** Per-series on-disk size in bytes, keyed by series id. */
  sizes?: Map<number, number>;
  cacheEnabled?: boolean;
};

const ACQ_LABEL = {
  missing: 'Missing',
  partial: 'Partial',
  complete: 'Complete',
} as const;

const statusLabel: Record<SeriesRow['status'], string> = {
  releasing: 'Releasing',
  finished: 'Finished',
  hiatus: 'Hiatus',
  cancelled: 'Cancelled',
};

/**
 * Series list view — design's `.list-table` / `.list-row` 7-col grid.
 * Source: docs/design/bookkeeprr-design-system.html lines 669-703.
 * Columns: cover-mini | title | type | vols | (size placeholder) | status | actions
 */
export function SeriesList({
  series,
  acquisition,
  sizes,
  cacheEnabled = false,
}: Props): React.JSX.Element {
  if (series.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No series match the current filter.
      </p>
    );
  }

  return (
    <div className="list-table">
      {/* Header row */}
      <div className="list-row head">
        <span></span>
        <span>Series</span>
        <span>Type</span>
        <span>Vols</span>
        <span>Size</span>
        <span>Status</span>
        <span></span>
      </div>

      {/* Body rows */}
      {series.map((s) => {
        const title = s.titleEnglish ?? s.titleRomaji ?? s.titleNative ?? `#${s.id}`;
        const acqCounts = acquisition?.get(s.id);
        const acq = acquisitionState(acqCounts?.owned ?? 0, acqCounts?.total ?? 0);
        return (
          <Link key={s.id} href={`/library/${s.id}`} className="list-row">
            {/* Cover mini */}
            <div className="cover-mini">
              <Cover
                className="absolute inset-0"
                src={libraryCoverSrc(s.coverUrl, cacheEnabled)}
                contentType={s.contentType}
                title={title}
                alt=""
              />
            </div>

            {/* Title */}
            <span className="name" title={title}>
              <span className="truncate">{title}</span>
              {s.titleNative && (
                <span className="block font-mono text-[10px] text-muted-foreground">
                  {s.titleNative}
                </span>
              )}
            </span>

            {/* Type */}
            <span>
              <ContentTypePill type={s.contentType} />
            </span>

            {/* Volumes */}
            <span className="num">{s.totalVolumes ?? '—'}</span>

            {/* On-disk size (sum of imported library-file bytes) */}
            <span className="num">{formatBytes(sizes?.get(s.id))}</span>

            {/* Status + acquisition */}
            <span className="flex items-center gap-2 text-[13px]">
              {statusLabel[s.status]}
              <span className={`badge-acq ${acq}`} aria-label={`Acquisition: ${ACQ_LABEL[acq]}`}>
                {ACQ_LABEL[acq]}
              </span>
            </span>

            {/* Actions slot (empty for now) */}
            <span></span>
          </Link>
        );
      })}
    </div>
  );
}

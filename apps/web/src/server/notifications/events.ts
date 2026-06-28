import type { SeriesRow, ReleaseRow } from '@/server/db/schema';

export type NotifyEvent =
  | {
      kind: 'grab-success';
      series: SeriesRow;
      release: ReleaseRow;
      indexerName: string;
    }
  | {
      kind: 'import-success';
      series: SeriesRow;
      /** Number of files imported in this run (one notification summarises them all). */
      count: number;
    }
  | {
      kind: 'failure';
      stage: 'grab' | 'import';
      series: SeriesRow | null;
      release: ReleaseRow | null;
      error: { code: string; message: string };
    }
  | {
      kind: 'update-available';
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
    }
  | { kind: 'test' };

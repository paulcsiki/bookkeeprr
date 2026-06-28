import { z } from 'zod';
import { ContentType } from './series';

export const KNOWN_DOWNLOAD_STATUSES = [
  'queued',
  'downloading',
  'completed',
  'importing',
  'imported',
  'failed',
  // A redundant sibling download the server cancelled after a better release
  // imported. Terminal.
  'superseded',
] as const;
export type KnownDownloadStatus = (typeof KNOWN_DOWNLOAD_STATUSES)[number];

// Forward-compatible by design. The server may add a new status (as `superseded`
// was added) and old installed apps must NOT throw on it — an unknown status
// would otherwise fail the whole downloads response and blank the screen, which
// is what forced a TestFlight rebuild last time. Known values validate to their
// literals; anything else passes through as the raw string so the UI can still
// render it generically (uppercased label, neutral dot).
export const DownloadStatus = z.union([z.enum(KNOWN_DOWNLOAD_STATUSES), z.string()]);
export type DownloadStatus = KnownDownloadStatus | (string & {});

export const Download = z.object({
  id: z.number().int().positive(),
  qbtHash: z.string(),
  status: DownloadStatus,
  addedAt: z.string(),
  completedAt: z.string().nullable(),
  importedAt: z.string().nullable(),
  error: z.string().nullable(),
  // Live qBittorrent transfer stats; null when not active or qbt is off.
  // Older servers omit these entirely, so they're optional too.
  progress: z.number().nullable().optional(),
  downloadSpeed: z.number().nullable().optional(),
  eta: z.number().nullable().optional(),
  seeds: z.number().nullable().optional(),
  sizeBytes: z.number().nullable().optional(),
  release: z
    .object({
      id: z.number().int().positive(),
      title: z.string(),
      indexerGuid: z.string(),
    })
    .nullable(),
  series: z
    .object({
      id: z.number().int().positive(),
      title: z.string(),
      // Root-relative /api/img proxy path (or absolute CDN url); resolve against
      // the server origin before loading. Older servers omit it.
      coverUrl: z.string().nullable().optional(),
      // Content type from the joined series row. Older servers omit it.
      contentType: ContentType.optional(),
    })
    .nullable(),
});
export type Download = z.infer<typeof Download>;

export const DownloadsResponse = z.object({
  downloads: z.array(Download),
});
export type DownloadsResponse = z.infer<typeof DownloadsResponse>;

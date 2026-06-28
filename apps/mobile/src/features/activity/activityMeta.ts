import type { Download, DownloadStatus, KnownDownloadStatus, ContentType } from '@/api/schemas';
import type { StatusKind } from '@/components/StatusDot';

const STATUS_KIND: Record<KnownDownloadStatus, StatusKind> = {
  queued: 'info',
  downloading: 'live',
  importing: 'live',
  completed: 'ok',
  imported: 'ok',
  failed: 'err',
  // Redundant sibling cancelled after a better release imported. Neutral —
  // nothing went wrong, so not 'err'.
  superseded: 'info',
};

export function downloadStatusKind(status: DownloadStatus): StatusKind {
  // Unknown future statuses (forward-compat, see DownloadStatus) get a neutral dot.
  return STATUS_KIND[status as KnownDownloadStatus] ?? 'info';
}

export const downloadTitle = (d: Download): string =>
  d.series?.title ?? d.release?.title ?? `Download #${d.id}`;

/** The series cover reference for a download row, or null when none is known. */
export const downloadCoverUrl = (d: Download): string | null => d.series?.coverUrl ?? null;

/**
 * Content-type hue values mirroring the design system's per-type accents.
 * Used for the gradient placeholder when the series has no cover image yet.
 */
const CONTENT_TYPE_HUE: Record<ContentType, number> = {
  manga: 12,
  comic: 45,
  novel: 220,
  ebook: 160,
  audio: 290,
};

/**
 * Hue for the cover gradient. Uses the content-type accent when available
 * (so placeholders are predictably colour-coded), falling back to a hash of
 * the title string for downloads whose series info has been lost.
 */
export function downloadCoverHue(d: Download): number {
  const ct = d.series?.contentType;
  if (ct && ct in CONTENT_TYPE_HUE) return CONTENT_TYPE_HUE[ct];
  // Stable hash fallback so the same title always gets the same hue.
  const s = downloadTitle(d);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

// qBittorrent reports eta in seconds; 8640000 (100 days) means "unknown".
export function formatEta(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds < 0 || seconds >= 8640000) return null;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

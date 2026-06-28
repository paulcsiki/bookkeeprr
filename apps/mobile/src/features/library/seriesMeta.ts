import type { ContentType, SeriesSummary, Volume } from '@/api/schemas';
import type { StatusKind } from '@/components/StatusDot';

export const TYPE_LABEL: Record<ContentType, string> = {
  manga: 'Manga',
  comic: 'Comic',
  novel: 'Light Novel',
  ebook: 'eBook',
  audio: 'Audiobook',
};

// Series-level data has no per-volume/queue state, so status is derived from
// owned-vs-total: complete → ok, partial → missing (warn), unknown → info.
export function seriesStatus(s: SeriesSummary): StatusKind {
  if (s.volumes > 0) return s.downloaded >= s.volumes ? 'ok' : 'warn';
  return s.downloaded > 0 ? 'ok' : 'info';
}

// Mono caption under a card/row, e.g. "12 / 27 VOLS" or the type for singles.
export function seriesMetaLine(s: SeriesSummary): string {
  if (s.volumes > 0) return `${s.downloaded} / ${s.volumes} VOLS`;
  return TYPE_LABEL[s.contentType].toUpperCase();
}

const VOLUME_STATUS: Record<Volume['status'], StatusKind> = {
  imported: 'ok',
  downloaded: 'ok',
  downloading: 'live',
  wanted: 'warn',
  unaired: 'info',
  failed: 'err',
};

export function volumeStatus(status: Volume['status']): StatusKind {
  return VOLUME_STATUS[status];
}

// A volume counts as "missing" when it isn't owned yet.
export function isVolumeMissing(status: Volume['status']): boolean {
  return status === 'wanted' || status === 'unaired' || status === 'failed';
}

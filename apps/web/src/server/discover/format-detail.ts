import type { ContentType } from '@/server/content-type';

export type DetailFields = {
  year?: number | null;
  status?: string | null;
  volumeCount?: number | null;
  fileSizeBytes?: number | null;
  durationMs?: number | null;
  format?: string | null; // e.g. 'EPUB', 'CBZ'
};

export function formatDetail(type: ContentType, fields: DetailFields): string | null {
  const parts: string[] = [];
  switch (type) {
    case 'manga':
    case 'comic': {
      if (fields.year) parts.push(String(fields.year));
      if (fields.status) parts.push(fields.status.toUpperCase());
      if (fields.volumeCount) parts.push(`${fields.volumeCount} VOL`);
      break;
    }
    case 'light_novel': {
      if (fields.year) parts.push(String(fields.year));
      if (fields.volumeCount) parts.push(`${fields.volumeCount} VOL`);
      break;
    }
    case 'ebook': {
      if (fields.format) parts.push(fields.format.toUpperCase());
      if (fields.fileSizeBytes) parts.push(formatBytes(fields.fileSizeBytes));
      else if (fields.year) parts.push(String(fields.year));
      break;
    }
    case 'audiobook': {
      if (fields.year) parts.push(String(fields.year));
      if (fields.durationMs) parts.push(`${Math.round(fields.durationMs / 3_600_000)} HRS`);
      break;
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GIB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MIB`;
  return `${Math.round(bytes / 1024)} KIB`;
}

import type { SeriesRow, VolumeRow } from '@/server/db/schema';
import { contentTypeToMetadataProfileId } from './profiles';

export type ReadarrImage = { coverType: 'poster' | 'cover'; url: string };

export type ReadarrBook = {
  id: number;
  title: string;
  authorId: number;
  authorTitle: string;
  foreignBookId: string;
  monitored: boolean;
  bookNumber: number;
  added: string;
  releaseDate: string | null;
  images: ReadarrImage[];
};

export type ReadarrAuthor = {
  id: number;
  authorName: string;
  foreignAuthorId: string;
  status: 'continuing' | 'ended';
  monitored: boolean;
  qualityProfileId: number;
  metadataProfileId: 1 | 2 | 3 | 4 | 5;
  rootFolderPath: string;
  path: string;
  added: string;
  images: ReadarrImage[];
  books: ReadarrBook[];
  overview: string;
};

function foreignIdForSeries(s: SeriesRow): string {
  if (s.contentType === 'ebook') return s.openlibraryId ?? s.isbn ?? '';
  if (s.contentType === 'audiobook') return s.asin ?? '';
  if (s.contentType === 'light_novel') return s.anilistId !== null ? String(s.anilistId) : '';
  if (s.contentType === 'manga') {
    if (s.anilistId !== null) return String(s.anilistId);
    return s.mangadexId ?? '';
  }
  if (s.contentType === 'comic') return s.comicvineId !== null ? String(s.comicvineId) : '';
  return '';
}

export function authorNameForSeries(s: SeriesRow): string {
  if (s.contentType === 'comic' && s.publisher !== null && s.publisher.length > 0) {
    return s.publisher;
  }
  return s.author ?? s.titleEnglish ?? s.titleRomaji ?? s.titleNative ?? `series-${s.id}`;
}

export function seriesToReadarrAuthor(s: SeriesRow, volumes: VolumeRow[]): ReadarrAuthor {
  const profileId = contentTypeToMetadataProfileId(s.contentType) ?? 1;
  const cover = s.coverUrl ? [{ coverType: 'poster' as const, url: s.coverUrl }] : [];
  return {
    id: s.id,
    authorName: authorNameForSeries(s),
    foreignAuthorId: foreignIdForSeries(s),
    status: s.status === 'releasing' ? 'continuing' : 'ended',
    monitored: s.monitoring !== 'none',
    qualityProfileId: s.qualityProfileId,
    metadataProfileId: profileId,
    rootFolderPath: s.rootPath,
    path: s.rootPath,
    added: s.addedAt instanceof Date ? s.addedAt.toISOString() : new Date(s.addedAt).toISOString(),
    images: cover,
    books: volumes.map((v) => volumeToReadarrBook(v, s)),
    overview: s.description ?? '',
  };
}

export function volumeToReadarrBook(v: VolumeRow, s: SeriesRow): ReadarrBook {
  const cover = s.coverUrl ? [{ coverType: 'cover' as const, url: s.coverUrl }] : [];
  return {
    id: v.id,
    title: v.title ?? s.titleEnglish ?? s.titleRomaji ?? `volume-${v.id}`,
    authorId: s.id,
    authorTitle: authorNameForSeries(s),
    foreignBookId: foreignIdForSeries(s),
    monitored: s.monitoring !== 'none',
    bookNumber: typeof v.number === 'number' && v.number > 0 ? v.number : 1,
    added: s.addedAt instanceof Date ? s.addedAt.toISOString() : new Date(s.addedAt).toISOString(),
    releaseDate:
      v.releaseDate instanceof Date
        ? v.releaseDate.toISOString()
        : v.releaseDate
          ? new Date(v.releaseDate).toISOString()
          : null,
    images: cover,
  };
}

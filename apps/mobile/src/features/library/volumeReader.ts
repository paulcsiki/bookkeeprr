import type { ContentType, Volume } from '@/api/schemas';
import type { LibraryStackParamList } from '@/navigation/types';

/**
 * A volume is readable once it's owned — the server sets `libraryFileId` to the
 * first library file backing the volume (audio files included). Missing volumes
 * have nothing to open.
 */
export function isVolumeReadable(v: Pick<Volume, 'libraryFileId'>): boolean {
  return v.libraryFileId != null;
}

/**
 * Reader-route params for opening a volume, or `null` when it isn't readable
 * yet (not owned). Audio volumes open by `volumeId` (the player keys off the
 * volume); every paged format opens by its backing `libraryFileId`. Mirrors
 * `ContinueReadingRail` and the web `/read/v/<id>` route.
 */
export function volumeReaderParams(
  contentType: ContentType,
  v: Pick<Volume, 'id' | 'libraryFileId'>,
): LibraryStackParamList['Reader'] | null {
  if (v.libraryFileId == null) return null;
  return contentType === 'audio'
    ? { volumeId: String(v.id) }
    : { fileId: String(v.libraryFileId) };
}

/**
 * Accessibility label for a tap-to-read volume row/card. Audiobooks are
 * listened to, not read — keep the copy content-type aware.
 */
export function volumeActionLabel(contentType: ContentType, number: Volume['number']): string {
  return contentType === 'audio'
    ? `Listen to volume ${String(number)}`
    : `Read volume ${String(number)}`;
}

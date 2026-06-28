import type { ContentType } from '@/server/content-type';

export type ReadarrMetadataProfile = {
  id: 1 | 2 | 3 | 4 | 5;
  name: string;
  contentType: 'ebook' | 'audiobook' | 'light_novel' | 'manga' | 'comic';
};

export const READARR_METADATA_PROFILES: readonly ReadarrMetadataProfile[] = [
  { id: 1, name: 'eBook', contentType: 'ebook' },
  { id: 2, name: 'Audiobook', contentType: 'audiobook' },
  { id: 3, name: 'Light Novel', contentType: 'light_novel' },
  { id: 4, name: 'Manga', contentType: 'manga' },
  { id: 5, name: 'Comic', contentType: 'comic' },
] as const;

export const READARR_CONTENT_TYPES: ReadonlyArray<ContentType> = [
  'ebook',
  'audiobook',
  'light_novel',
  'manga',
  'comic',
];

export function metadataProfileToContentType(
  id: number,
): 'ebook' | 'audiobook' | 'light_novel' | 'manga' | 'comic' | null {
  const p = READARR_METADATA_PROFILES.find((x) => x.id === id);
  return p?.contentType ?? null;
}

export function contentTypeToMetadataProfileId(ct: ContentType): 1 | 2 | 3 | 4 | 5 | null {
  const p = READARR_METADATA_PROFILES.find((x) => x.contentType === ct);
  return p?.id ?? null;
}

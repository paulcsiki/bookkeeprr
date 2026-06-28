import { describe, expect, it } from 'vitest';
import {
  READARR_METADATA_PROFILES,
  READARR_CONTENT_TYPES,
  metadataProfileToContentType,
  contentTypeToMetadataProfileId,
} from '@/server/readarr/profiles';

describe('READARR_METADATA_PROFILES', () => {
  it('has all five content types in profile-id order', () => {
    expect(READARR_METADATA_PROFILES.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    expect(READARR_METADATA_PROFILES.map((p) => p.contentType)).toEqual([
      'ebook',
      'audiobook',
      'light_novel',
      'manga',
      'comic',
    ]);
  });
});

describe('READARR_CONTENT_TYPES', () => {
  it('lists all five content types', () => {
    expect(READARR_CONTENT_TYPES).toEqual(['ebook', 'audiobook', 'light_novel', 'manga', 'comic']);
  });
});

describe('metadataProfileToContentType', () => {
  it('maps 1 → ebook', () => {
    expect(metadataProfileToContentType(1)).toBe('ebook');
  });
  it('maps 2 → audiobook', () => {
    expect(metadataProfileToContentType(2)).toBe('audiobook');
  });
  it('maps 3 → light_novel', () => {
    expect(metadataProfileToContentType(3)).toBe('light_novel');
  });
  it('maps 4 → manga', () => {
    expect(metadataProfileToContentType(4)).toBe('manga');
  });
  it('maps 5 → comic', () => {
    expect(metadataProfileToContentType(5)).toBe('comic');
  });
  it('returns null for unknown id', () => {
    expect(metadataProfileToContentType(99)).toBeNull();
  });
});

describe('contentTypeToMetadataProfileId', () => {
  it('round-trips all five', () => {
    expect(contentTypeToMetadataProfileId('ebook')).toBe(1);
    expect(contentTypeToMetadataProfileId('audiobook')).toBe(2);
    expect(contentTypeToMetadataProfileId('light_novel')).toBe(3);
    expect(contentTypeToMetadataProfileId('manga')).toBe(4);
    expect(contentTypeToMetadataProfileId('comic')).toBe(5);
  });
});

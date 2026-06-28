import { volumeReaderParams, isVolumeReadable } from '@/features/library/volumeReader';

describe('volumeReaderParams', () => {
  it('returns null for an unowned volume (nothing to read)', () => {
    expect(volumeReaderParams('manga', { id: 5, libraryFileId: null })).toBeNull();
    expect(volumeReaderParams('audio', { id: 5, libraryFileId: null })).toBeNull();
    expect(isVolumeReadable({ libraryFileId: null })).toBe(false);
    expect(isVolumeReadable({ libraryFileId: undefined })).toBe(false);
  });

  it('opens a paged volume by its backing libraryFileId', () => {
    expect(volumeReaderParams('manga', { id: 5, libraryFileId: 42 })).toEqual({ fileId: '42' });
    expect(volumeReaderParams('comic', { id: 5, libraryFileId: 42 })).toEqual({ fileId: '42' });
    expect(volumeReaderParams('novel', { id: 5, libraryFileId: 42 })).toEqual({ fileId: '42' });
    expect(volumeReaderParams('ebook', { id: 5, libraryFileId: 42 })).toEqual({ fileId: '42' });
  });

  it('opens an audiobook volume by its volumeId, not the file id', () => {
    expect(volumeReaderParams('audio', { id: 7, libraryFileId: 42 })).toEqual({ volumeId: '7' });
    expect(isVolumeReadable({ libraryFileId: 42 })).toBe(true);
  });
});

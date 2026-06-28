import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  contentTypeSubdir,
  getAllLibraryRoots,
  getLibraryDir,
  getMediaRoot,
  getQbtCategory,
} from '@/server/content-type/paths';
import {
  contentTypePathsSetting,
  torrentCleanupSetting,
} from '@/server/db/settings/library';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';

// getMediaRoot reads a DB setting, so the test needs its OWN clean DB — otherwise
// it inherits the media-root setting a prior test left on the shared connection
// (the order-dependent flake this isolates against).
let h: SeedHandle;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

describe('contentTypeSubdir', () => {
  it('maps manga/comic to comics', () => {
    expect(contentTypeSubdir('manga')).toBe('comics');
    expect(contentTypeSubdir('comic')).toBe('comics');
  });
  it('maps light_novel/ebook to books', () => {
    expect(contentTypeSubdir('light_novel')).toBe('books');
    expect(contentTypeSubdir('ebook')).toBe('books');
  });
  it('maps audiobook to audiobooks', () => {
    expect(contentTypeSubdir('audiobook')).toBe('audiobooks');
  });
});

describe('getMediaRoot', () => {
  it('defaults to /media when env var not set', async () => {
    delete process.env.BOOKKEEPRR_MEDIA_ROOT;
    expect(await getMediaRoot()).toBe('/media');
  });
  it('uses env var when set', async () => {
    process.env.BOOKKEEPRR_MEDIA_ROOT = '/custom/path';
    expect(await getMediaRoot()).toBe('/custom/path');
  });
});

describe('getLibraryDir', () => {
  beforeEach(() => {
    process.env.BOOKKEEPRR_MEDIA_ROOT = '/media';
  });

  it('falls back to mediaRoot/<subdir> when libraryRoot is blank', async () => {
    expect(await getLibraryDir('manga')).toBe('/media/comics');
    expect(await getLibraryDir('comic')).toBe('/media/comics');
    expect(await getLibraryDir('ebook')).toBe('/media/books');
    expect(await getLibraryDir('light_novel')).toBe('/media/books');
    expect(await getLibraryDir('audiobook')).toBe('/media/audiobooks');
  });

  it('returns the per-type override verbatim when set', async () => {
    await contentTypePathsSetting.set({
      manga: { libraryRoot: '/mnt/manga', qbtCategory: '' },
      comic: { libraryRoot: '', qbtCategory: '' },
      light_novel: { libraryRoot: '', qbtCategory: '' },
      ebook: { libraryRoot: '/mnt/ebooks', qbtCategory: '' },
      audiobook: { libraryRoot: '', qbtCategory: '' },
    });
    expect(await getLibraryDir('manga')).toBe('/mnt/manga');
    expect(await getLibraryDir('ebook')).toBe('/mnt/ebooks');
    // unset type still falls back
    expect(await getLibraryDir('comic')).toBe('/media/comics');
  });
});

describe('getQbtCategory', () => {
  it('falls back to bookkeeprr-<type> when blank', async () => {
    expect(await getQbtCategory('manga')).toBe('bookkeeprr-manga');
    expect(await getQbtCategory('audiobook')).toBe('bookkeeprr-audiobook');
  });

  it('returns the custom category when set', async () => {
    await contentTypePathsSetting.set({
      manga: { libraryRoot: '', qbtCategory: 'my-manga' },
      comic: { libraryRoot: '', qbtCategory: '' },
      light_novel: { libraryRoot: '', qbtCategory: '' },
      ebook: { libraryRoot: '', qbtCategory: '' },
      audiobook: { libraryRoot: '', qbtCategory: '' },
    });
    expect(await getQbtCategory('manga')).toBe('my-manga');
    expect(await getQbtCategory('comic')).toBe('bookkeeprr-comic');
  });
});

describe('getAllLibraryRoots', () => {
  beforeEach(() => {
    process.env.BOOKKEEPRR_MEDIA_ROOT = '/media';
  });

  it('dedupes overlapping fallbacks', async () => {
    // manga + comic → /media/comics, light_novel + ebook → /media/books,
    // audiobook → /media/audiobooks ⇒ 3 unique entries.
    const roots = await getAllLibraryRoots();
    expect(roots).toEqual(['/media/comics', '/media/books', '/media/audiobooks']);
  });

  it('reflects per-type overrides', async () => {
    await contentTypePathsSetting.set({
      manga: { libraryRoot: '/mnt/manga', qbtCategory: '' },
      comic: { libraryRoot: '', qbtCategory: '' },
      light_novel: { libraryRoot: '', qbtCategory: '' },
      ebook: { libraryRoot: '', qbtCategory: '' },
      audiobook: { libraryRoot: '', qbtCategory: '' },
    });
    const roots = await getAllLibraryRoots();
    expect(roots).toContain('/mnt/manga');
    expect(roots).toContain('/media/comics');
    expect(roots).toContain('/media/books');
    expect(roots).toContain('/media/audiobooks');
    expect(new Set(roots).size).toBe(roots.length);
  });
});

describe('settings validation', () => {
  it('contentTypePaths defaults to all-blank when unset', async () => {
    const val = await contentTypePathsSetting.get();
    expect(val).toEqual({
      manga: { libraryRoot: '', qbtCategory: '' },
      comic: { libraryRoot: '', qbtCategory: '' },
      light_novel: { libraryRoot: '', qbtCategory: '' },
      ebook: { libraryRoot: '', qbtCategory: '' },
      audiobook: { libraryRoot: '', qbtCategory: '' },
    });
  });

  it('torrentCleanup defaults to never when unset', async () => {
    expect(await torrentCleanupSetting.get()).toEqual({ mode: 'never', deleteFiles: false });
  });

  it('rejects an invalid cleanup mode', async () => {
    await expect(
      // @ts-expect-error intentionally invalid mode
      torrentCleanupSetting.set({ mode: 'whenever', deleteFiles: false }),
    ).rejects.toThrow();
  });

  it('accepts ratio for after_ratio mode', async () => {
    await torrentCleanupSetting.set({ mode: 'after_ratio', ratio: 1.5, deleteFiles: true });
    expect(await torrentCleanupSetting.get()).toEqual({
      mode: 'after_ratio',
      ratio: 1.5,
      deleteFiles: true,
    });
  });
});

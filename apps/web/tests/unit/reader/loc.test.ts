import { describe, it, expect } from 'vitest';
import type { ReaderManifest } from '@bookkeeprr/types';
import { manifestWithLoc, resolveLoc } from '@/components/reader/lib/loc';

function epubManifest(over: Partial<ReaderManifest> = {}): ReaderManifest {
  return {
    readableKey: 'page:file:1',
    contentType: 'ebook',
    reader: 'text',
    format: 'epub',
    title: 'Book',
    seriesId: 1,
    spine: [
      { idx: 0, href: 'a.xhtml' },
      { idx: 1, href: 'b.xhtml' },
      { idx: 2, href: 'c.xhtml' },
      { idx: 3, href: 'd.xhtml' },
    ],
    progress: {
      readableKey: 'page:file:1',
      position: 0.9,
      locator: { spineIdx: 3, pageInItem: 0 },
      finished: false,
      restartedFromFinish: false,
    },
    ...over,
  };
}

function pdfManifest(over: Partial<ReaderManifest> = {}): ReaderManifest {
  return {
    readableKey: 'page:file:2',
    contentType: 'ebook',
    reader: 'text',
    format: 'pdf',
    title: 'PDF',
    seriesId: 1,
    pageCount: 10,
    progress: {
      readableKey: 'page:file:2',
      position: 0.5,
      locator: { page: 5 },
      finished: false,
      restartedFromFinish: false,
    },
    ...over,
  };
}

describe('resolveLoc', () => {
  it('resolves an epub spine token to a position + locator', () => {
    const seed = resolveLoc('spine:1', epubManifest());
    expect(seed).not.toBeNull();
    expect(seed!.locator).toEqual({ spineIdx: 1, pageInItem: 0 });
    expect(seed!.position).toBeCloseTo(1 / 4);
  });

  it('clamps an out-of-range epub spine index', () => {
    const seed = resolveLoc('spine:99', epubManifest());
    expect(seed!.locator).toEqual({ spineIdx: 3, pageInItem: 0 });
  });

  it('resolves a pdf page token to a position + locator', () => {
    const seed = resolveLoc('page:5', pdfManifest());
    expect(seed!.locator).toEqual({ page: 5 });
    expect(seed!.position).toBeCloseTo(5 / 9);
  });

  it('returns null for an absent or empty token', () => {
    expect(resolveLoc(undefined, epubManifest())).toBeNull();
    expect(resolveLoc(null, epubManifest())).toBeNull();
    expect(resolveLoc('', epubManifest())).toBeNull();
  });

  it('returns null when the token shape does not match the format', () => {
    expect(resolveLoc('page:3', epubManifest())).toBeNull();
    expect(resolveLoc('spine:1', pdfManifest())).toBeNull();
    expect(resolveLoc('garbage', epubManifest())).toBeNull();
  });

  it('returns null for comics/audio formats', () => {
    const comics = epubManifest({ format: 'cbz', reader: 'comics' });
    expect(resolveLoc('spine:1', comics)).toBeNull();
  });
});

describe('manifestWithLoc', () => {
  it('lets a valid loc win over saved progress', () => {
    const m = manifestWithLoc(epubManifest(), 'spine:1');
    expect(m.progress.locator).toEqual({ spineIdx: 1, pageInItem: 0 });
    expect(m.progress.position).toBeCloseTo(1 / 4);
  });

  it('falls back to saved progress when loc is absent', () => {
    const original = epubManifest();
    const m = manifestWithLoc(original, undefined);
    expect(m).toBe(original);
    expect(m.progress.locator).toEqual({ spineIdx: 3, pageInItem: 0 });
  });

  it('falls back to saved progress when loc is invalid', () => {
    const original = epubManifest();
    const m = manifestWithLoc(original, 'page:2');
    expect(m).toBe(original);
  });

  it('does not mutate the input manifest', () => {
    const original = epubManifest();
    const before = original.progress.position;
    manifestWithLoc(original, 'spine:0');
    expect(original.progress.position).toBe(before);
  });
});

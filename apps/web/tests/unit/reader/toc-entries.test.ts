import { describe, it, expect } from 'vitest';
import type { ReaderManifest } from '@bookkeeprr/types';
import { tocEntriesFromManifest } from '@/server/reader/toc';

const baseProgress = {
  readableKey: 'file:1',
  position: 0,
  locator: null,
  finished: false,
  restartedFromFinish: false,
};

function epubManifest(toc: ReaderManifest['toc']): ReaderManifest {
  return {
    readableKey: 'file:1',
    contentType: 'ebook',
    reader: 'text',
    format: 'epub',
    title: 'T',
    seriesId: 1,
    toc,
    progress: baseProgress,
  };
}

function pdfManifest(toc: ReaderManifest['toc']): ReaderManifest {
  return {
    readableKey: 'file:2',
    contentType: 'ebook',
    reader: 'comics',
    format: 'pdf',
    title: 'T',
    seriesId: 1,
    pageCount: 10,
    toc,
    progress: baseProgress,
  };
}

describe('tocEntriesFromManifest', () => {
  it('maps epub spineIdx entries to spine: tokens', () => {
    const m = epubManifest([
      { label: 'One', href: 'a', spineIdx: 0 },
      { label: 'Two', href: 'b', spineIdx: 3 },
    ]);
    expect(tocEntriesFromManifest(m)).toEqual([
      { title: 'One', loc: 'spine:0' },
      { title: 'Two', loc: 'spine:3' },
    ]);
  });

  it('drops epub entries without a spineIdx', () => {
    const m = epubManifest([
      { label: 'One', href: 'a', spineIdx: 0 },
      { label: 'No target', href: 'b' },
    ]);
    expect(tocEntriesFromManifest(m)).toEqual([{ title: 'One', loc: 'spine:0' }]);
  });

  it('maps pdf page entries (1-based) to 0-based page: tokens', () => {
    const m = pdfManifest([
      { label: 'Chapter One', href: '', page: 1 },
      { label: 'Chapter Two', href: '', page: 2 },
    ]);
    expect(tocEntriesFromManifest(m)).toEqual([
      { title: 'Chapter One', loc: 'page:0' },
      { title: 'Chapter Two', loc: 'page:1' },
    ]);
  });

  it('drops pdf entries without a page', () => {
    const m = pdfManifest([
      { label: 'Chapter One', href: '', page: 1 },
      { label: 'No target', href: '' },
    ]);
    expect(tocEntriesFromManifest(m)).toEqual([{ title: 'Chapter One', loc: 'page:0' }]);
  });

  it('yields no entries for a pdf with no toc', () => {
    expect(tocEntriesFromManifest(pdfManifest(undefined))).toEqual([]);
  });
});

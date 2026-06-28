import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseEpub, readEpubResource } from '@/server/reader/formats/epub';

const EPUB = resolve(__dirname, '../../fixtures/reader/sample.epub');
const EPUB_NS = resolve(__dirname, '../../fixtures/reader/sample-ns-opf.epub');

describe('epub adapter', () => {
  it('parses spine + toc + opfDir', async () => {
    const m = await parseEpub(EPUB);
    expect(m.opfDir).toBe('OEBPS');
    expect(m.spine.map((s) => s.href)).toEqual(['ch1.xhtml', 'ch2.xhtml']);
    expect(m.toc.length).toBe(2);
    expect(m.toc[0]!.label).toBe('Chapter One');
  });

  // Regression: an OPF whose package elements use a namespace prefix
  // (<opf:manifest>, <opf:item>, <opf:spine>, <opf:itemref>) is valid per spec.
  // The parser used to match only unprefixed tags, so the spine came back empty
  // and the health-check rejected the (perfectly readable) book as `empty-epub`
  // — e.g. the real "Terciel and Elinor" EPUB.
  it('parses an OPF with namespace-prefixed package elements', async () => {
    const m = await parseEpub(EPUB_NS);
    expect(m.spine.map((s) => s.href)).toEqual(['ch1.xhtml', 'ch2.xhtml']);
    expect(m.toc.length).toBe(2);
    expect(m.toc[0]!.label).toBe('Chapter One');
  });

  it('reads a spine resource with xhtml content-type', async () => {
    const r = await readEpubResource(EPUB, 'OEBPS/ch1.xhtml');
    expect(r.contentType).toMatch(/xhtml|html/);
    expect(r.buffer.toString()).toContain('<');
  });

  it('rejects an unknown / traversal entry', async () => {
    await expect(readEpubResource(EPUB, 'OEBPS/../secret')).rejects.toThrow();
    await expect(readEpubResource(EPUB, 'OEBPS/missing.xhtml')).rejects.toThrow();
  });
});

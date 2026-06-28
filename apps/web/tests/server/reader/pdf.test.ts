import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { pdfPageCount, pdfOutline } from '@/server/reader/formats/pdf';

const PDF = resolve(__dirname, '../../fixtures/reader/sample.pdf');
const PDF_OUTLINE = resolve(__dirname, '../../fixtures/reader/sample-outline.pdf');

describe('pdfPageCount', () => {
  it('counts 2 pages', async () => {
    expect(await pdfPageCount(PDF)).toBe(2);
  });
});

describe('pdfOutline', () => {
  it('extracts outline entries with 1-based page numbers', async () => {
    const outline = await pdfOutline(PDF_OUTLINE);
    expect(outline).toEqual([
      { title: 'Chapter One', page: 1 },
      { title: 'Chapter Two', page: 2 },
    ]);
  });

  it('returns [] for a PDF with no outline', async () => {
    expect(await pdfOutline(PDF)).toEqual([]);
  });

  it('returns [] (no throw) for a non-PDF / missing path', async () => {
    expect(await pdfOutline('/no/such/file.pdf')).toEqual([]);
    expect(await pdfOutline(resolve(__dirname, 'pdf.test.ts'))).toEqual([]);
  });
});

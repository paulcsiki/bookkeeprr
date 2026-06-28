import { describe, expect, it } from 'vitest';
import { formatDetail } from '@/server/discover/format-detail';

describe('formatDetail()', () => {
  // ------- manga -------
  describe('manga', () => {
    it('renders year · status · volumes', () => {
      expect(formatDetail('manga', { year: 2013, status: 'ongoing', volumeCount: 27 }))
        .toBe('2013 · ONGOING · 27 VOL');
    });

    it('omits null fields', () => {
      expect(formatDetail('manga', { year: 2018, status: null, volumeCount: null }))
        .toBe('2018');
    });

    it('returns null when all fields are missing', () => {
      expect(formatDetail('manga', {})).toBeNull();
    });
  });

  // ------- comic -------
  describe('comic', () => {
    it('renders year · status · volumes (same as manga)', () => {
      expect(formatDetail('comic', { year: 1987, status: 'finished', volumeCount: 12 }))
        .toBe('1987 · FINISHED · 12 VOL');
    });

    it('returns null for empty fields', () => {
      expect(formatDetail('comic', {})).toBeNull();
    });
  });

  // ------- light_novel -------
  describe('light_novel', () => {
    it('renders year · volumes', () => {
      expect(formatDetail('light_novel', { year: 2015, volumeCount: 11 }))
        .toBe('2015 · 11 VOL');
    });

    it('omits volumes when null', () => {
      expect(formatDetail('light_novel', { year: 2010 })).toBe('2010');
    });

    it('ignores status field', () => {
      expect(formatDetail('light_novel', { year: 2010, status: 'ongoing' })).toBe('2010');
    });
  });

  // ------- ebook -------
  describe('ebook', () => {
    it('renders format · size in MiB', () => {
      expect(formatDetail('ebook', { format: 'epub', fileSizeBytes: 14_680_064 }))
        .toBe('EPUB · 14.0 MIB');
    });

    it('renders format · size in GiB for large files', () => {
      const oneGib = 1024 ** 3;
      expect(formatDetail('ebook', { format: 'cbz', fileSizeBytes: oneGib * 2.5 }))
        .toBe('CBZ · 2.5 GIB');
    });

    it('renders format · size in KiB for small files', () => {
      expect(formatDetail('ebook', { format: 'epub', fileSizeBytes: 512 * 1024 }))
        .toBe('EPUB · 512 KIB');
    });

    it('falls back to year when no size', () => {
      expect(formatDetail('ebook', { format: 'epub', year: 2021 }))
        .toBe('EPUB · 2021');
    });

    it('renders only year when no format and no size', () => {
      expect(formatDetail('ebook', { year: 2021 })).toBe('2021');
    });

    it('returns null when all fields missing', () => {
      expect(formatDetail('ebook', {})).toBeNull();
    });
  });

  // ------- audiobook -------
  describe('audiobook', () => {
    it('renders year · hours', () => {
      // 10 hours in ms
      const durationMs = 10 * 3_600_000;
      expect(formatDetail('audiobook', { year: 2021, durationMs }))
        .toBe('2021 · 10 HRS');
    });

    it('rounds duration to nearest hour', () => {
      const durationMs = Math.round(1.7 * 3_600_000);
      expect(formatDetail('audiobook', { year: 2021, durationMs }))
        .toBe('2021 · 2 HRS');
    });

    it('omits hours when durationMs is null', () => {
      expect(formatDetail('audiobook', { year: 2021 })).toBe('2021');
    });

    it('returns null for empty fields', () => {
      expect(formatDetail('audiobook', {})).toBeNull();
    });
  });
});

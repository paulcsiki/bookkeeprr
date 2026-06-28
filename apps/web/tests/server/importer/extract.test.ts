import { describe, expect, it } from 'vitest';
import { isOuterArchive } from '@/server/importer/extract';

describe('isOuterArchive', () => {
  it('matches .zip, .rar, .7z', () => {
    expect(isOuterArchive('foo.zip')).toBe(true);
    expect(isOuterArchive('foo.rar')).toBe(true);
    expect(isOuterArchive('foo.7z')).toBe(true);
    expect(isOuterArchive('foo.ZIP')).toBe(true);
  });

  it('does NOT match .cbz, .cbr, .epub, .pdf, .mobi, .azw3', () => {
    expect(isOuterArchive('foo.cbz')).toBe(false);
    expect(isOuterArchive('foo.cbr')).toBe(false);
    expect(isOuterArchive('foo.epub')).toBe(false);
    expect(isOuterArchive('foo.pdf')).toBe(false);
    expect(isOuterArchive('foo.mobi')).toBe(false);
    expect(isOuterArchive('foo.azw3')).toBe(false);
  });

  it('does NOT match unrelated extensions', () => {
    expect(isOuterArchive('foo.txt')).toBe(false);
    expect(isOuterArchive('foo')).toBe(false);
  });
});

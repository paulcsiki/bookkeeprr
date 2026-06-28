import { describe, it, expect } from 'vitest';
import { isChapterPresent } from '@/app/(app)/library/[id]/tabs/ChaptersTab';

describe('isChapterPresent', () => {
  it('present when the chapter owns its own file (chapter-format series)', () => {
    expect(isChapterPresent(true, null, new Set())).toBe(true);
    expect(isChapterPresent(true, 3, new Set())).toBe(true);
  });

  it('present when the parent volume is present, even without an own file', () => {
    expect(isChapterPresent(false, 3, new Set([3]))).toBe(true);
  });

  it('missing when neither the chapter nor its volume has a file', () => {
    expect(isChapterPresent(false, 3, new Set([7]))).toBe(false);
    expect(isChapterPresent(false, null, new Set([3]))).toBe(false);
  });

  it('missing when no present-volume set is supplied and no own file', () => {
    expect(isChapterPresent(false, 3, undefined)).toBe(false);
  });
});

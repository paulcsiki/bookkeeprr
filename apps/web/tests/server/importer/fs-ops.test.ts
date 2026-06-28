import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  sameFilesystem,
  hardlinkOrCopy,
  needsHash,
  sha1OfFile,
  resolveDestination,
} from '@/server/importer/fs-ops';

let tmpA: string;
let tmpB: string;

beforeEach(() => {
  tmpA = mkdtempSync(join(tmpdir(), 'bk-fs-a-'));
  tmpB = mkdtempSync(join(tmpdir(), 'bk-fs-b-'));
});
afterEach(() => {
  rmSync(tmpA, { recursive: true, force: true });
  rmSync(tmpB, { recursive: true, force: true });
});

describe('needsHash', () => {
  it('threshold is 50 MB', () => {
    expect(needsHash(50 * 1024 * 1024)).toBe(false);
    expect(needsHash(50 * 1024 * 1024 + 1)).toBe(true);
    expect(needsHash(0)).toBe(false);
  });
});

describe('sameFilesystem', () => {
  it('returns true for two paths in the same tmpdir', () => {
    expect(sameFilesystem(tmpA, tmpA)).toBe(true);
  });
});

describe('hardlinkOrCopy', () => {
  it('creates a hardlink within one filesystem', async () => {
    const src = join(tmpA, 'src.bin');
    const dst = join(tmpA, 'dst.bin');
    writeFileSync(src, 'hello');
    await hardlinkOrCopy(src, dst);
    expect(existsSync(dst)).toBe(true);
    const a = statSync(src);
    const b = statSync(dst);
    expect(a.ino).toBe(b.ino); // hardlink shares inode
  });
});

describe('sha1OfFile', () => {
  it('hashes a small file', async () => {
    const p = join(tmpA, 'data.bin');
    writeFileSync(p, 'abc');
    const h = await sha1OfFile(p);
    // sha1('abc') = a9993e364706816aba3e25717850c26c9cd0d89d
    expect(h).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
});

describe('resolveDestination', () => {
  it('returns action=write when desired path does not exist', async () => {
    const dst = join(tmpA, 'novel.cbz');
    const r = await resolveDestination(dst, async () => 'none');
    expect(r).toEqual({ path: dst, action: 'write' });
  });

  it('returns skip-identical when desired path has identical content', async () => {
    const dst = join(tmpA, 'novel.cbz');
    writeFileSync(dst, 'existing');
    const r = await resolveDestination(dst, async () => 'identical');
    expect(r).toEqual({ path: dst, action: 'skip-identical' });
  });

  it('walks suffixes when content differs', async () => {
    const dst = join(tmpA, 'novel.cbz');
    let n = 0;
    const compare = async (): Promise<'identical' | 'different' | 'none'> => {
      n++;
      if (n <= 3) return 'different';
      return 'none';
    };
    const r = await resolveDestination(dst, compare);
    expect(r.action).toBe('suffixed');
    expect(r.path).toBe(join(tmpA, 'novel (3).cbz'));
  });

  it('throws after exhausting 50 suffixes', async () => {
    const dst = join(tmpA, 'novel.cbz');
    await expect(resolveDestination(dst, async () => 'different')).rejects.toThrow(
      /exhausted-suffix/,
    );
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walk } from '@/server/scanner/walk';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bk-walk-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function collect(rootPath: string): Promise<Array<{ directory: string; files: string[] }>> {
  const out: Array<{ directory: string; files: string[] }> = [];
  for await (const entry of walk(rootPath)) out.push(entry);
  return out;
}

describe('walk', () => {
  it('emits one entry per directory containing supported archives', async () => {
    mkdirSync(join(root, 'Chainsaw Man'));
    writeFileSync(join(root, 'Chainsaw Man', 'Chainsaw Man - v01.cbz'), '');
    writeFileSync(join(root, 'Chainsaw Man', 'Chainsaw Man - v02.cbz'), '');
    mkdirSync(join(root, 'Berserk'));
    writeFileSync(join(root, 'Berserk', 'Berserk v01.cbr'), '');
    const out = await collect(root);
    expect(out).toHaveLength(2);
    const csm = out.find((e) => e.directory.endsWith('Chainsaw Man'));
    expect(csm?.files.map((f) => f.split('/').pop()).sort()).toEqual([
      'Chainsaw Man - v01.cbz',
      'Chainsaw Man - v02.cbz',
    ]);
  });

  it('case-insensitive extensions', async () => {
    mkdirSync(join(root, 'A'));
    writeFileSync(join(root, 'A', 'A v01.CBZ'), '');
    writeFileSync(join(root, 'A', 'A v02.Cbr'), '');
    const out = await collect(root);
    expect(out).toHaveLength(1);
    expect(out[0]!.files).toHaveLength(2);
  });

  it('skips directories with no supported archives', async () => {
    mkdirSync(join(root, 'Empty'));
    writeFileSync(join(root, 'Empty', 'cover.jpg'), '');
    writeFileSync(join(root, 'Empty', 'info.txt'), '');
    const out = await collect(root);
    expect(out).toHaveLength(0);
  });

  it('skips dotfile directories', async () => {
    mkdirSync(join(root, '.thumbnails'));
    writeFileSync(join(root, '.thumbnails', 'hidden v01.cbz'), '');
    mkdirSync(join(root, 'Visible'));
    writeFileSync(join(root, 'Visible', 'v01.cbz'), '');
    const out = await collect(root);
    expect(out).toHaveLength(1);
    expect(out[0]!.directory).toContain('Visible');
  });

  it('skips symlinks (no traversal)', async () => {
    mkdirSync(join(root, 'Real'));
    writeFileSync(join(root, 'Real', 'r.cbz'), '');
    symlinkSync(join(root, 'Real'), join(root, 'Link'));
    const out = await collect(root);
    expect(out).toHaveLength(1);
    expect(out[0]!.directory).toContain('Real');
  });

  it('recurses into nested directories', async () => {
    mkdirSync(join(root, 'Publisher A', 'Series One'), { recursive: true });
    writeFileSync(join(root, 'Publisher A', 'Series One', 'v01.cbz'), '');
    const out = await collect(root);
    expect(out).toHaveLength(1);
    expect(out[0]!.directory.endsWith(join('Publisher A', 'Series One'))).toBe(true);
  });

  it('skips @eaDir directories (Synology NAS artefact)', async () => {
    mkdirSync(join(root, '@eaDir'));
    writeFileSync(join(root, '@eaDir', 'hidden v01.cbz'), '');
    mkdirSync(join(root, 'Visible'));
    writeFileSync(join(root, 'Visible', 'v01.cbz'), '');
    const out = await collect(root);
    expect(out).toHaveLength(1);
    expect(out[0]!.directory).toContain('Visible');
  });
});

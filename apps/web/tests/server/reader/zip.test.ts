import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { listEntries, readEntry } from '@/server/reader/formats/zip';

const CBZ = resolve(__dirname, '../../fixtures/reader/sample.cbz');

describe('zip reader', () => {
  it('lists all entries', async () => {
    const names = await listEntries(CBZ);
    expect(names.sort()).toEqual(['001.png', '002.png', '003.png', 'cover.txt']);
  });

  it('reads a stored/deflated entry to bytes (png magic)', async () => {
    const buf = await readEntry(CBZ, '001.png');
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('throws on unknown entry', async () => {
    await expect(readEntry(CBZ, 'nope.png')).rejects.toThrow();
  });
});

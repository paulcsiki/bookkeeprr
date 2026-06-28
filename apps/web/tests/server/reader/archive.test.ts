import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { listImageEntries, readArchiveEntry } from '@/server/reader/formats/archive';

const CBZ = resolve(__dirname, '../../fixtures/reader/sample.cbz');

describe('archive adapter', () => {
  it('lists image entries in natural order, excluding non-images', async () => {
    expect(await listImageEntries(CBZ)).toEqual(['001.png', '002.png', '003.png']);
  });

  it('reads an entry with png content-type', async () => {
    const { buffer, contentType } = await readArchiveEntry(CBZ, '001.png');
    expect(buffer.length).toBeGreaterThan(0);
    expect(contentType).toBe('image/png');
  });
});

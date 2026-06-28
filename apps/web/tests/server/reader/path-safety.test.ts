import { vi, describe, it, expect } from 'vitest';

vi.mock('@/server/db/library-files', () => ({ getLibraryFile: vi.fn() }));

import { getLibraryFile } from '@/server/db/library-files';
import { resolveLibraryFilePath } from '@/server/reader/path-safety';

describe('resolveLibraryFilePath', () => {
  it('returns not_found for a missing library file row', async () => {
    vi.mocked(getLibraryFile).mockResolvedValue(null);
    expect(await resolveLibraryFilePath(123)).toEqual({ ok: false, error: 'not_found' });
  });
});

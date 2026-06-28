import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { insertSeries } from '@/server/db/series';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles';
import { findInLib } from '@/server/discover/in-lib';

let tmpDir: string;
let qpId: number;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bk-inlib-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmpDir, 'test.db');
  const migrationsFolder = path.resolve(__dirname, '../../../drizzle');
  migrate(getDb(), { migrationsFolder });
  qpId = await seedDefaultQualityProfile();
});

afterEach(async () => {
  await closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_DB_PATH;
});

describe('findInLib()', () => {
  it('returns empty set for empty input', async () => {
    const result = await findInLib([]);
    expect(result.size).toBe(0);
  });

  it('returns matching key when title is in library', async () => {
    await insertSeries({
      titleEnglish: 'Chainsaw Man',
      contentType: 'manga',
      status: 'releasing',
      rootPath: '/media/manga/chainsaw-man',
      qualityProfileId: qpId,
    });

    const result = await findInLib([
      { title: 'Chainsaw Man', contentType: 'manga' },
    ]);

    expect(result.has('manga::chainsaw man')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('does not match when content type differs', async () => {
    await insertSeries({
      titleEnglish: 'Chainsaw Man',
      contentType: 'manga',
      status: 'releasing',
      rootPath: '/media/manga/chainsaw-man',
      qualityProfileId: qpId,
    });

    const result = await findInLib([
      { title: 'Chainsaw Man', contentType: 'ebook' },
    ]);

    expect(result.size).toBe(0);
  });

  it('matches case-insensitively', async () => {
    await insertSeries({
      titleEnglish: 'Project Hail Mary',
      contentType: 'ebook',
      status: 'finished',
      rootPath: '/media/ebooks/hail-mary',
      qualityProfileId: qpId,
    });

    const result = await findInLib([
      { title: 'PROJECT HAIL MARY', contentType: 'ebook' },
    ]);

    expect(result.has('ebook::project hail mary')).toBe(true);
  });

  it('handles multiple items, some in library and some not', async () => {
    await insertSeries({
      titleEnglish: 'Berserk',
      contentType: 'manga',
      status: 'finished',
      rootPath: '/media/manga/berserk',
      qualityProfileId: qpId,
    });

    const result = await findInLib([
      { title: 'Berserk', contentType: 'manga' },
      { title: 'One Piece', contentType: 'manga' },
    ]);

    expect(result.has('manga::berserk')).toBe(true);
    expect(result.has('manga::one piece')).toBe(false);
    expect(result.size).toBe(1);
  });

  it('matches by titleRomaji when titleEnglish is null', async () => {
    await insertSeries({
      titleEnglish: null,
      titleRomaji: 'Fullmetal Alchemist',
      contentType: 'manga',
      status: 'finished',
      rootPath: '/media/manga/fma',
      qualityProfileId: qpId,
    });

    const result = await findInLib([
      { title: 'Fullmetal Alchemist', contentType: 'manga' },
    ]);

    expect(result.has('manga::fullmetal alchemist')).toBe(true);
  });
});

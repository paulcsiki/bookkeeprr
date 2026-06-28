#!/usr/bin/env node
// Seed readables (series + volume + library file each) for real-server
// mobile e2e runs: an EPUB (text reader) and a CBZ (comics reader).
//
// The Maestro real-server text-reader flow
// (apps/mobile/tests/e2e/reader/text-reader-real.yaml) opens this seeded ebook
// through a LIVE server: the manifest comes from
// `/api/reader/manifest?fileId=<id>` and the chapter HTML is fetched by the
// NATIVE WebView from `/api/reader/epub/<id>/resource` — the in-app fetch mock
// can never serve that request, which is why this coverage lives in the
// real-server CI job at all. Both endpoints need a real `.epub` on disk under
// the server's media root, so this script:
//
//   1. copies the committed reader fixture
//      (tests/fixtures/reader/sample.epub — the same file the web Playwright
//      e2e stages into its container, see tests/e2e/helpers/reader-seed.ts)
//      into `$BOOKKEEPRR_MEDIA_ROOT/books/Seed Ebook/`, and
//   2. inserts the series / volume / library_files rows pointing at it,
//      mirroring tests/e2e/fixtures/reader-seed.cjs but through the DAL.
//
// REQUIRES `BOOKKEEPRR_MEDIA_ROOT` to be set, and the server process must be
// started with the SAME value — the reader's path-safety guard
// (src/server/reader/path-safety.ts) rejects any library file whose realpath
// is not under the media root.
//
// Idempotent: re-running with the epub already registered is a no-op. On a
// fresh e2e DB the created ids are deterministic (series 1 / volume 1 /
// file 1); the Maestro flow's `grid-card-1` / `vol-1` testIDs rely on that.
//
// Usage: tsx scripts/e2e-seed-readables.ts

import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getLibraryFileByPath, insertLibraryFile } from '../src/server/db/library-files';
import {
  createGroup,
  listGroups,
  moveSeriesToGroup,
} from '../src/server/db/library-groups';
import { seedDefaultQualityProfile } from '../src/server/db/quality-profiles';
import { insertSeries } from '../src/server/db/series';
import { insertVolume } from '../src/server/db/volumes';
import {
  createBookSeries,
  listBookSeries,
  addMember,
  replaceEntries,
} from '../src/server/db/book-series';

const here = fileURLToPath(new URL('.', import.meta.url));

/** A readable to seed: fixture file → media-root location + series metadata. */
interface SeedReadable {
  fixture: string;
  /** contentTypeSubdir for the content type, so the layout mirrors a real import. */
  subdir: string;
  seriesTitle: string;
  fileName: string;
  contentType: 'ebook' | 'comic';
}

// Seeded IN ORDER on a fresh e2e DB, so ids are deterministic:
//   Seed Ebook → series 1 / volume 1 / file 1  (text-reader-real.yaml)
//   Seed Comic → series 2 / volume 2 / file 2  (comics-real.yaml)
const READABLES: SeedReadable[] = [
  {
    fixture: resolve(here, '../tests/fixtures/reader/sample.epub'),
    subdir: 'books',
    seriesTitle: 'Seed Ebook',
    fileName: 'Seed Ebook - Volume 01.epub',
    contentType: 'ebook',
  },
  {
    fixture: resolve(here, '../tests/fixtures/reader/sample.cbz'),
    subdir: 'comics',
    seriesTitle: 'Seed Comic',
    fileName: 'Seed Comic - Volume 01.cbz',
    contentType: 'comic',
  },
];

async function seedOne(mediaRoot: string, r: SeedReadable): Promise<void> {
  const seriesDir = join(mediaRoot, r.subdir, r.seriesTitle);
  const filePath = join(seriesDir, r.fileName);

  mkdirSync(seriesDir, { recursive: true });
  copyFileSync(r.fixture, filePath);

  const existing = await getLibraryFileByPath(filePath);
  if (existing !== null) {
    console.log(
      `e2e readable already present: series=${existing.seriesId} ` +
        `volume=${existing.volumeId} file=${existing.id}`,
    );
    return;
  }

  // series.quality_profile_id is a NOT NULL FK; first-run setup never happens
  // in the real-server job (the login-bypass user is inserted directly), so
  // make sure a profile exists.
  const qualityProfileId = await seedDefaultQualityProfile();

  const seriesId = await insertSeries({
    contentType: r.contentType,
    titleEnglish: r.seriesTitle,
    status: 'releasing',
    rootPath: seriesDir,
    qualityProfileId,
    monitoring: 'all',
    granularity: 'volume',
  });
  const volumeId = await insertVolume({ seriesId, number: 1, title: 'Volume 1' });
  const fileId = await insertLibraryFile({
    seriesId,
    volumeId,
    path: filePath,
    sizeBytes: statSync(filePath).size,
  });

  console.log(
    `Seeded e2e readable (${r.contentType}): series=${seriesId} volume=${volumeId} file=${fileId}`,
  );
}

/**
 * Seed a library group with one member series for the real-server groups flow
 * (apps/mobile/tests/e2e/library/groups-real.yaml).
 *
 * On a fresh e2e DB the ids are deterministic: group 1 ('Seed Group') and
 * series 3 ('Seed Grouped' — the readables above own series 1 and 2). The
 * member is a NEW metadata-only series rather than one of the readables:
 * grouped series leave the library root's UNGROUPED grid, which would break
 * the reader real-server flows' `grid-card-1`/`grid-card-2` taps.
 *
 * Idempotent: a present 'Seed Group' short-circuits the whole step.
 */
async function seedGroup(mediaRoot: string): Promise<void> {
  const existing = (await listGroups()).find((g) => g.name === 'Seed Group');
  if (existing !== undefined) {
    console.log(`e2e group already present: ${existing.name} (id=${existing.id})`);
    return;
  }

  const group = await createGroup('Seed Group', null);
  const qualityProfileId = await seedDefaultQualityProfile();
  const seriesId = await insertSeries({
    contentType: 'ebook',
    titleEnglish: 'Seed Grouped',
    status: 'releasing',
    rootPath: join(mediaRoot, 'books', 'Seed Grouped'),
    qualityProfileId,
    monitoring: 'all',
    granularity: 'volume',
  });
  await moveSeriesToGroup(seriesId, group.id);
  console.log(`Seeded e2e group: group=${group.id} member series=${seriesId}`);
}

/**
 * Seed a book series with two ebook member series for the real-server
 * book-series flow (apps/mobile/tests/e2e/system/book-series.yaml).
 *
 * Prerequisites: seedReadables + seedGroup must have run first so that
 * series 1 ('Seed Ebook', ebook, ungrouped) and series 3 ('Seed Grouped',
 * ebook, in group 1) both exist. On a fresh e2e DB the created ids are
 * deterministic: book_series id=1 ('Seed Book Series').
 *
 * The flow taps `book-series-row-1` at the library root (series 1 is
 * ungrouped, so it surfaces the collapse → row), opens the detail screen
 * (`book-series-detail-screen`), then navigates to series 1's SeriesOverview
 * via `owned-book-1` and asserts `part-of-series-row`.
 *
 * Idempotent: a present 'Seed Book Series' short-circuits the whole step.
 */
async function seedBookSeries(): Promise<void> {
  const existing = (await listBookSeries()).find((bs) => bs.name === 'Seed Book Series');
  if (existing !== undefined) {
    console.log(`e2e book series already present: ${existing.name} (id=${existing.id})`);
    return;
  }

  const bs = await createBookSeries({
    name: 'Seed Book Series',
    contentType: 'ebook',
    source: 'manual',
    description: 'Seeded for e2e testing.',
  });

  // series 1 = 'Seed Ebook' (ebook, ungrouped) — drives book-series-row-1 at library root.
  // series 3 = 'Seed Grouped' (ebook, in group 1) — second member for ≥2 requirement.
  await addMember(bs.id, 1, { position: 1, linkSource: 'manual' });
  await addMember(bs.id, 3, { position: 2, linkSource: 'manual' });

  // members 1 & 3 have no matching entry → they render as owned orphans (positions 1, 2).
  // 'Seed Missing Book' has no member → renders as the unowned/missing book.
  await replaceEntries(bs.id, [
    { position: 3, title: 'Seed Missing Book', externalRef: null, coverUrl: null },
  ]);

  console.log(`Seeded e2e book series: id=${bs.id} members=[1,3]`);
}

async function main(): Promise<void> {
  const mediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  if (mediaRoot === undefined || mediaRoot.length === 0) {
    throw new Error(
      'e2e-seed-readables: BOOKKEEPRR_MEDIA_ROOT must be set (and the server ' +
        'must run with the same value), or the reader path-safety guard will ' +
        'reject the seeded file.',
    );
  }
  for (const r of READABLES) {
    await seedOne(mediaRoot, r);
  }
  await seedGroup(mediaRoot);
  await seedBookSeries();
}

void main();

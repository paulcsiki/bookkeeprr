/* eslint-disable */
// Reader e2e seed — runs *inside* the bookkeeprr container via
// `docker compose exec`. Uses the container's bundled better-sqlite3 to insert
// a series + volume + library_files for each reader kind, pointing at the
// reader fixtures that reader-seed.ts copies into /media first. Raw SQL only
// (no app modules) so it's resilient to internal refactors.
//
// Prints a JSON blob of the created ids to stdout so the spec can address the
// seeded readables.
const path = require('node:path');
const fs = require('node:fs');

const MEDIA_ROOT = process.env.BOOKKEEPRR_MEDIA_ROOT || '/media';
// The server resolves its DB from BOOKKEEPRR_DB_PATH, else `./bookkeeprr.dev.db`
// relative to the WORKDIR (/app/apps/web). The e2e image ships no DB_PATH env,
// so the live DB is the dev db under the app workdir — target that, since this
// script is exec'd with cwd = /app/apps/web.
const DB_PATH = process.env.BOOKKEEPRR_DB_PATH || path.resolve('bookkeeprr.dev.db');

// better-sqlite3 ships in the container under apps/web/node_modules.
const Database = require('better-sqlite3');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const now = Date.now();

// A quality profile is required by series.quality_profile_id (NOT NULL FK).
// First-run creates a default; fall back to inserting one if somehow absent.
let qp = db.prepare('SELECT id FROM quality_profiles ORDER BY id LIMIT 1').get();
if (!qp) {
  const info = db.prepare("INSERT INTO quality_profiles (name) VALUES ('seed')").run();
  qp = { id: info.lastInsertRowid };
}
const qpId = qp.id;

function insertSeries(contentType, titleEnglish) {
  const info = db
    .prepare(
      `INSERT INTO series
        (content_type, title_english, status, root_path, monitoring, granularity,
         quality_profile_id, extra_search_terms_json, added_at, updated_at)
       VALUES (?, ?, 'releasing', ?, 'all', 'volume', ?, '[]', ?, ?)`,
    )
    .run(contentType, titleEnglish, path.join(MEDIA_ROOT, titleEnglish), qpId, now, now);
  return info.lastInsertRowid;
}

function insertVolume(seriesId, number) {
  const info = db
    .prepare(
      `INSERT INTO volumes (series_id, number, metadata_json) VALUES (?, ?, '{}')`,
    )
    .run(seriesId, number);
  return info.lastInsertRowid;
}

function insertFile(seriesId, volumeId, filePath) {
  const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  const info = db
    .prepare(
      `INSERT INTO library_files (series_id, volume_id, path, size_bytes, imported_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(seriesId, volumeId, filePath, size, now);
  return info.lastInsertRowid;
}

const out = {};

// Comic (CBZ) — paged comics reader, addressed by fileId.
{
  const s = insertSeries('comic', 'Seed Comic');
  const v = insertVolume(s, 1);
  const f = insertFile(s, v, path.join(MEDIA_ROOT, 'sample.cbz'));
  out.comic = { seriesId: s, volumeId: v, fileId: f };
}

// eBook (EPUB) — text reader, addressed by fileId.
{
  const s = insertSeries('ebook', 'Seed Ebook');
  const v = insertVolume(s, 1);
  const f = insertFile(s, v, path.join(MEDIA_ROOT, 'sample.epub'));
  out.ebook = { seriesId: s, volumeId: v, fileId: f };
}

// Audiobook (MP3) — audio reader, addressed by volumeId.
{
  const s = insertSeries('audiobook', 'Seed Audiobook');
  const v = insertVolume(s, 1);
  const f = insertFile(s, v, path.join(MEDIA_ROOT, 'sample.mp3'));
  out.audio = { seriesId: s, volumeId: v, fileId: f };
}

db.close();
process.stdout.write(JSON.stringify(out));

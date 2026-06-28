/* eslint-disable */
// Activity e2e seed — runs *inside* the bookkeeprr container via `docker exec`
// (same pattern as reader-seed.cjs). Inserts an indexer + series + release +
// a download row with status 'superseded' so the Activity page has a history
// row to render. Raw SQL only (no app modules) so it's resilient to internal
// refactors.
//
// Prints a JSON blob of the created ids to stdout so the spec can address the
// seeded rows.
const path = require('node:path');

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

// releases.indexer_id is a NOT NULL FK — seed a throwaway indexer for it.
const indexerId = db
  .prepare(
    `INSERT INTO indexers (kind, name, base_url, config_json, enabled)
     VALUES ('nyaa', 'Seed Indexer', 'http://mock-nyaa:8080', '{}', 1)`,
  )
  .run().lastInsertRowid;

const seriesId = db
  .prepare(
    `INSERT INTO series
      (content_type, title_english, status, root_path, monitoring, granularity,
       quality_profile_id, extra_search_terms_json, added_at, updated_at)
     VALUES ('manga', 'Seed Superseded Series', 'releasing', ?, 'all', 'volume', ?, '[]', ?, ?)`,
  )
  .run(path.join(MEDIA_ROOT, 'Seed Superseded Series'), qpId, now, now).lastInsertRowid;

const RELEASE_TITLE = '[SeedGroup] Seed Superseded Series v01 (superseded e2e)';
const releaseId = db
  .prepare(
    `INSERT INTO releases
      (series_id, indexer_id, indexer_guid, title, link, target_kind,
       target_low, target_high, size_bytes, seeders, leechers, published_at, discovered_at)
     VALUES (?, ?, 'seed-superseded-guid-1', ?, 'http://mock-nyaa:8080/seed-superseded.torrent',
             'volume', 1, 1, 1048576, 10, 1, ?, ?)`,
  )
  .run(seriesId, indexerId, RELEASE_TITLE, now, now).lastInsertRowid;

// The superseded download: a redundant sibling cancelled after a better
// release imported. Terminal state; completed_at set, imported_at NULL.
const QBT_HASH = 'feedfacefeedfacefeedfacefeedfacefeedface';
const downloadId = db
  .prepare(
    `INSERT INTO downloads (release_id, qbt_hash, status, added_at, completed_at)
     VALUES (?, ?, 'superseded', ?, ?)`,
  )
  .run(releaseId, QBT_HASH, now, now).lastInsertRowid;

db.close();
process.stdout.write(
  JSON.stringify({
    seriesId,
    releaseId,
    downloadId,
    qbtHash: QBT_HASH,
    releaseTitle: RELEASE_TITLE,
  }),
);

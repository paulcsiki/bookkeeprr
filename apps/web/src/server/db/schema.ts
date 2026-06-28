import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { USER_SOURCES } from '@bookkeeprr/types/pure';
import { CONTENT_TYPES } from '@/server/content-type';

// ============================================================
// M1 tables (carried over unchanged)
// ============================================================

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const indexers = sqliteTable('indexers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  configJson: text('config_json').notNull().default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRssAt: integer('last_rss_at', { mode: 'timestamp_ms' }),
  lastSearchAt: integer('last_search_at', { mode: 'timestamp_ms' }),
});

// ============================================================
// M2 tables
// ============================================================

export const qualityProfiles = sqliteTable('quality_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  preferCompleteBatches: integer('prefer_complete_batches', { mode: 'boolean' })
    .notNull()
    .default(false),
  preferredGroupsJson: text('preferred_groups_json').notNull().default('[]'),
  preferredLanguagesJson: text('preferred_languages_json').notNull().default('["en"]'),
  minSizeMb: integer('min_size_mb'),
  maxSizeMb: integer('max_size_mb'),
  preferOriginals: integer('prefer_originals', { mode: 'boolean' }).notNull().default(false),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
});

export const libraryGroups = sqliteTable(
  'library_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    parentId: integer('parent_id').references((): AnySQLiteColumn => libraryGroups.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // SQLite treats NULLs as distinct — root-level uniqueness is enforced in
    // the DAL; this constraint covers same-parent siblings.
    parentNameUnique: uniqueIndex('library_groups_parent_name_uniq').on(
      table.parentId,
      table.name,
    ),
  }),
);

export const series = sqliteTable(
  'series',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contentType: text('content_type', { enum: CONTENT_TYPES }).notNull().default('manga'),
    anilistId: integer('anilist_id'),
    malId: integer('mal_id'),
    comicvineId: integer('comicvine_id'),
    publisher: text('publisher'),
    startYear: integer('start_year'),
    pageCount: integer('page_count'),
    runtimeMinutes: integer('runtime_minutes'),
    author: text('author'),
    openlibraryId: text('openlibrary_id'),
    isbn: text('isbn'),
    asin: text('asin'),
    narrator: text('narrator'),
    mangadexId: text('mangadex_id'),
    novelUpdatesSlug: text('novel_updates_slug'),
    novelUpdatesId: integer('novel_updates_id'),
    googleBooksVolumeId: text('google_books_volume_id'),
    googleBooksQuery: text('google_books_query'),
    titleEnglish: text('title_english'),
    titleRomaji: text('title_romaji'),
    titleNative: text('title_native'),
    status: text('status', {
      enum: ['releasing', 'finished', 'hiatus', 'cancelled'],
    }).notNull(),
    coverUrl: text('cover_url'),
    description: text('description'),
    totalVolumes: integer('total_volumes'),
    totalChapters: integer('total_chapters'),
    rootPath: text('root_path').notNull(),
    monitoring: text('monitoring', {
      enum: ['none', 'all', 'future', 'missing'],
    })
      .notNull()
      .default('all'),
    granularity: text('granularity', { enum: ['volume', 'chapter'] })
      .notNull()
      .default('volume'),
    qualityProfileId: integer('quality_profile_id')
      .notNull()
      .references(() => qualityProfiles.id),
    groupId: integer('group_id').references(() => libraryGroups.id),
    extraSearchTermsJson: text('extra_search_terms_json').notNull().default('[]'),
    addedAt: integer('added_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    anilistIdUnique: uniqueIndex('series_anilist_id_uniq').on(table.anilistId),
    malIdUnique: uniqueIndex('series_mal_id_uniq').on(table.malId),
    comicvineIdUnique: uniqueIndex('series_comicvine_id_uniq').on(table.comicvineId),
    openlibraryIdUnique: uniqueIndex('series_openlibrary_id_uniq').on(table.openlibraryId),
    isbnIdx: index('series_isbn_idx').on(table.isbn),
    asinUnique: uniqueIndex('series_asin_uniq').on(table.asin),
  }),
);

export const volumes = sqliteTable(
  'volumes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seriesId: integer('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title'),
    releaseDate: integer('release_date', { mode: 'timestamp_ms' }),
    metadataJson: text('metadata_json').notNull().default('{}'),
  },
  (table) => ({
    seriesNumberUnique: uniqueIndex('volumes_series_number_uniq').on(table.seriesId, table.number),
  }),
);

export const chapters = sqliteTable(
  'chapters',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seriesId: integer('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    volumeId: integer('volume_id').references(() => volumes.id, {
      onDelete: 'set null',
    }),
    numberText: text('number_text').notNull(),
    numberSort: real('number_sort').notNull(),
    title: text('title'),
    releaseDate: integer('release_date', { mode: 'timestamp_ms' }),
    mangadexChapterId: text('mangadex_chapter_id'),
  },
  (table) => ({
    seriesSortUnique: uniqueIndex('chapters_series_sort_uniq').on(table.seriesId, table.numberSort),
  }),
);

// ============================================================
// Book series (collection grouping above individual series)
// ============================================================

export const bookSeries = sqliteTable('book_series', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  contentType: text('content_type', { enum: CONTENT_TYPES }).notNull(),
  description: text('description'),
  coverUrl: text('cover_url'),
  totalBooks: integer('total_books'),
  source: text('source', {
    enum: ['manual', 'openlibrary', 'itunes', 'audible', 'googlebooks'],
  }).notNull(),
  externalId: text('external_id'),
  externalIdsJson: text('external_ids_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const bookSeriesMembers = sqliteTable(
  'book_series_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bookSeriesId: integer('book_series_id').notNull()
      .references(() => bookSeries.id, { onDelete: 'cascade' }),
    seriesId: integer('series_id').notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    position: real('position'),
    linkSource: text('link_source', { enum: ['manual', 'auto'] }).notNull(),
  },
  (table) => ({
    bsSeriesUnique: uniqueIndex('book_series_members_bs_series_uniq').on(
      table.bookSeriesId, table.seriesId,
    ),
    seriesIdx: index('book_series_members_series_idx').on(table.seriesId),
  }),
);

export const bookSeriesEntries = sqliteTable(
  'book_series_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bookSeriesId: integer('book_series_id').notNull()
      .references(() => bookSeries.id, { onDelete: 'cascade' }),
    position: real('position'),
    title: text('title').notNull(),
    externalRef: text('external_ref'),
    coverUrl: text('cover_url'),
  },
  (table) => ({
    bsRefUnique: uniqueIndex('book_series_entries_bs_ref_uniq').on(
      table.bookSeriesId, table.externalRef,
    ),
  }),
);

export type BookSeriesRow = typeof bookSeries.$inferSelect;
export type BookSeriesInsert = typeof bookSeries.$inferInsert;
export type BookSeriesMemberRow = typeof bookSeriesMembers.$inferSelect;
export type BookSeriesEntryRow = typeof bookSeriesEntries.$inferSelect;

export const releases = sqliteTable(
  'releases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seriesId: integer('series_id').references(() => series.id, {
      onDelete: 'set null',
    }),
    indexerId: integer('indexer_id')
      .notNull()
      .references(() => indexers.id, { onDelete: 'cascade' }),
    indexerGuid: text('indexer_guid').notNull(),
    title: text('title').notNull(),
    link: text('link').notNull(),
    targetKind: text('target_kind', {
      enum: ['volume', 'chapter', 'batch'],
    }).notNull(),
    targetLow: real('target_low'),
    targetHigh: real('target_high'),
    groupName: text('group_name'),
    language: text('language'),
    sizeBytes: integer('size_bytes').notNull(),
    seeders: integer('seeders').notNull().default(0),
    leechers: integer('leechers').notNull().default(0),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
    // When bookkeeprr first saw this release (NOT the torrent's own pub date).
    // Set once on insert; preserved across upserts. Used to window replays by
    // discovery time — publishedAt can be years old for books/back-catalogue.
    discoveredAt: integer('discovered_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    score: real('score'),
    trusted: integer('trusted', { mode: 'boolean' }),
    remake: integer('remake', { mode: 'boolean' }),
    // Auto-grab backoff. When the most recent grab attempt for this release
    // failed with a retryable error, `grabFailedAt` is set and `grabAttempts`
    // counts consecutive failures. Both are preserved across upserts (NOT in the
    // onConflict set) so a transient indexer outage backs off exponentially
    // instead of re-attempting — and re-notifying Discord — every poll cycle.
    // Cleared on a successful grab.
    grabFailedAt: integer('grab_failed_at', { mode: 'timestamp_ms' }),
    grabAttempts: integer('grab_attempts').notNull().default(0),
    // Permanent "rejected" blacklist. Set when a grabbed release turns out to be
    // bad (corrupt / wrong-format, per the content health-check). Once stamped,
    // the release is NEVER grabbed again — auto-grab excludes it and the matcher
    // skips it on replays/searches, so auto-grab falls through to the next-best
    // candidate. Like `grabFailedAt`, these two columns are preserved across
    // upserts (NOT in the onConflict set) so re-discovery can't resurrect a bad
    // release. Unlike grab-backoff, rejection has no expiry.
    rejectedAt: integer('rejected_at', { mode: 'timestamp_ms' }),
    rejectionReason: text('rejection_reason'),
  },
  (table) => ({
    indexerGuidUnique: uniqueIndex('releases_indexer_guid_uniq').on(
      table.indexerId,
      table.indexerGuid,
    ),
    seriesIdx: index('releases_series_idx').on(table.seriesId),
  }),
);

export const downloads = sqliteTable(
  'downloads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    releaseId: integer('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    qbtHash: text('qbt_hash').notNull(),
    status: text('status', {
      enum: ['queued', 'downloading', 'completed', 'importing', 'imported', 'failed', 'superseded'],
    })
      .notNull()
      .default('queued'),
    addedAt: integer('added_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    importedAt: integer('imported_at', { mode: 'timestamp_ms' }),
    error: text('error'),
    /** Bytes downloaded as reported by qBittorrent `completed` field. Updated
     *  each qbt-watch tick where the torrent is `downloading`. Used to detect
     *  stalled downloads: if this hasn't increased for 5 minutes the grab is
     *  marked failed and the torrent deleted so the next cycle can try a better
     *  candidate. */
    bytesDownloaded: integer('bytes_downloaded').notNull().default(0),
    /** Last time `bytesDownloaded` increased (or the download was first added).
     *  Stored as ms timestamp. The stall window is measured against this field:
     *  if `now − lastProgressAt >= 5 min` and no new bytes arrived the grab
     *  stalled. Initialized to `addedAt` so the 5-minute window starts at grab
     *  time rather than the epoch. */
    lastProgressAt: integer('last_progress_at', { mode: 'timestamp_ms' }),
  },
  (table) => ({
    qbtHashUnique: uniqueIndex('downloads_qbt_hash_uniq').on(table.qbtHash),
  }),
);

export const libraryFiles = sqliteTable(
  'library_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seriesId: integer('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    volumeId: integer('volume_id').references(() => volumes.id, {
      onDelete: 'set null',
    }),
    chapterId: integer('chapter_id').references(() => chapters.id, {
      onDelete: 'set null',
    }),
    path: text('path').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    hashSha1: text('hash_sha1'),
    importedAt: integer('imported_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sourceReleaseId: integer('source_release_id').references(() => releases.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    pathUnique: uniqueIndex('library_files_path_uniq').on(table.path),
  }),
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'completed', 'failed', 'interrupted', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    scheduledFor: integer('scheduled_for', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    payloadJson: text('payload_json').notNull().default('{}'),
    resultJson: text('result_json'),
    error: text('error'),
    attempt: integer('attempt').notNull().default(0),
  },
  (table) => ({
    kindStatusIdx: index('jobs_kind_status_idx').on(table.kind, table.status),
    scheduledForIdx: index('jobs_scheduled_for_idx').on(table.scheduledFor),
  }),
);

export const scanMatches = sqliteTable(
  'scan_matches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    filePath: text('file_path').notNull(),
    status: text('status', {
      enum: ['pending', 'confirmed', 'rejected', 'skipped'],
    })
      .notNull()
      .default('pending'),
    proposedSeriesId: integer('proposed_series_id').references(() => series.id, {
      onDelete: 'set null',
    }),
    proposedVolume: integer('proposed_volume'),
    proposedChapter: text('proposed_chapter'),
    confidence: real('confidence').notNull().default(0),
    parserDebugJson: text('parser_debug_json').notNull().default('{}'),
    scanRootPath: text('scan_root_path'),
    targetGroupId: integer('target_group_id'),
    structure: text('structure', { enum: ['flat', 'mirror'] }),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
  },
  (table) => ({
    filePathUnique: uniqueIndex('scan_matches_path_uniq').on(table.filePath),
  }),
);

export const readingProgress = sqliteTable(
  'reading_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readableKey: text('readable_key').notNull(),
    seriesId: integer('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    volumeId: integer('volume_id').references(() => volumes.id, { onDelete: 'set null' }),
    libraryFileId: integer('library_file_id').references(() => libraryFiles.id, {
      onDelete: 'set null',
    }),
    contentType: text('content_type', { enum: CONTENT_TYPES }).notNull(),
    position: real('position').notNull().default(0),
    locatorJson: text('locator_json').notNull().default('null'),
    finished: integer('finished', { mode: 'boolean' }).notNull().default(false),
    /**
     * Per-device stable ID. Nullable for backward compat — legacy rows (written
     * before DS11f) have NULL and are treated as "unknown device" (no handoff
     * card generated). New writes from web/mobile always supply a UUID.
     */
    deviceId: text('device_id'),
    /**
     * Human-readable label for the device that wrote this row, e.g.
     * "Chrome on macOS" or "Paul's iPhone". Nullable for the same reason.
     */
    deviceName: text('device_name'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    /**
     * One shared progress row per (user, readable) — progress is unified across
     * devices, so reading anywhere updates the same row (last-write-wins). The
     * deviceId/deviceName columns record the device that last wrote it (for the
     * handoff card). (Superseded the old per-device unique index in 0035.)
     */
    userKeyUniq: uniqueIndex('reading_progress_user_key_uniq').on(
      table.userId,
      table.readableKey,
    ),
    userUpdatedIdx: index('reading_progress_user_updated_idx').on(table.userId, table.updatedAt),
  }),
);
export type ReadingProgressRow = typeof readingProgress.$inferSelect;

export const readingStatsDaily = sqliteTable(
  'reading_stats_daily',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Calendar day in UTC, formatted YYYY-MM-DD.
    day: text('day').notNull(),
    /**
     * The content type the day's reading is attributed to (the readable's
     * series `content_type`). Plain text — not enum-constrained — so legacy
     * rows written before this column existed carry the sentinel `'other'`
     * (no historical backfill). New writes always store a valid ContentType.
     * The grain is (userId, day, contentType); existing callers that want a
     * daily total must sum across content types for a (user, day).
     */
    contentType: text('content_type').notNull().default('other'),
    secondsRead: integer('seconds_read').notNull().default(0),
    // "Units" of content consumed that day: pages/chapters for paged readers,
    // listened-minutes for audio. Cross-type so the weekly chart can sum them.
    unitsRead: integer('units_read').notNull().default(0),
  },
  (table) => ({
    userDayTypeUniq: uniqueIndex('reading_stats_daily_user_day_type_uniq').on(
      table.userId,
      table.day,
      table.contentType,
    ),
    userDayIdx: index('reading_stats_daily_user_day_idx').on(table.userId, table.day),
  }),
);
export type ReadingStatsDailyRow = typeof readingStatsDaily.$inferSelect;

// ============================================================
// Chapter read-state (per-user mark-as-read)
// ============================================================

export const chapterRead = sqliteTable(
  'chapter_read',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    readAt: integer('read_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userChapterUniq: uniqueIndex('chapter_read_user_chapter_uniq').on(table.userId, table.chapterId),
    userIdx: index('chapter_read_user_idx').on(table.userId),
  }),
);

export type ChapterReadRow = typeof chapterRead.$inferSelect;

// ============================================================
// Type exports for query helpers
// ============================================================

export type SettingRow = typeof settings.$inferSelect;
export type IndexerRow = typeof indexers.$inferSelect;
export type QualityProfileRow = typeof qualityProfiles.$inferSelect;
export type SeriesRow = typeof series.$inferSelect;
export type SeriesInsert = typeof series.$inferInsert;
export type VolumeRow = typeof volumes.$inferSelect;
export type VolumeInsert = typeof volumes.$inferInsert;
export type ChapterRow = typeof chapters.$inferSelect;
export type ChapterInsert = typeof chapters.$inferInsert;
export type ReleaseRow = typeof releases.$inferSelect;
export type ReleaseInsert = typeof releases.$inferInsert;
export type DownloadRow = typeof downloads.$inferSelect;
export type DownloadInsert = typeof downloads.$inferInsert;
export type LibraryFileRow = typeof libraryFiles.$inferSelect;
export type LibraryFileInsert = typeof libraryFiles.$inferInsert;
export type JobRow = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;
export type ScanMatchRow = typeof scanMatches.$inferSelect;
export type ScanMatchInsert = typeof scanMatches.$inferInsert;

// Hint to silence linter for unused import; `sql` is used by future helpers.
void sql;

// ============================================================
// M20 tables — auth foundation
// ============================================================

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    passwordHash: text('password_hash'),
    role: text('role', { enum: ['admin', 'user'] }).notNull(),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
    authSource: text('auth_source', { enum: USER_SOURCES }).notNull().default('local'),
    oidcIssuer: text('oidc_issuer'),
    oidcSubject: text('oidc_subject'),
    email: text('email'),
    displayName: text('display_name'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
    lastSeenChangelogVersion: text('last_seen_changelog_version'),
    avatarPath: text('avatar_path'),
    totpSecretEncrypted: text('totp_secret_encrypted'),
    totpEnabledAt: integer('totp_enabled_at', { mode: 'timestamp_ms' }),
    totpRecoveryCodesHashed: text('totp_recovery_codes_hashed'),
  },
  (table) => ({
    usernameUnique: uniqueIndex('users_username_uniq').on(table.username),
    oidcUnique: uniqueIndex('users_oidc_uniq').on(table.oidcIssuer, table.oidcSubject),
    emailIdx: index('users_email_idx').on(table.email),
  }),
);

export type UserRow = typeof users.$inferSelect;

export const sessions = sqliteTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (table) => ({
    userExpiresIdx: index('sessions_user_expires_idx').on(table.userId, table.expiresAt),
    expiresIdx: index('sessions_expires_idx').on(table.expiresAt),
  }),
);

export type SessionRow = typeof sessions.$inferSelect;

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actorKind: text('actor_kind', { enum: ['user', 'system', 'anonymous'] }).notNull(),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorUsername: text('actor_username'),
    action: text('action').notNull(),
    targetKind: text('target_kind'),
    targetId: text('target_id'),
    metadataJson: text('metadata_json'),
    peerIp: text('peer_ip'),
    clientIp: text('client_ip'),
    userAgent: text('user_agent'),
  },
  (t) => ({
    timestampIdx: index('audit_events_timestamp_idx').on(t.timestamp),
    actionIdx: index('audit_events_action_idx').on(t.action, t.timestamp),
    actorIdx: index('audit_events_actor_idx').on(t.actorUserId, t.timestamp),
  }),
);

export type AuditEventRow = typeof auditEvents.$inferSelect;

export const replayRuns = sqliteTable(
  'replay_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    triggeredAt: integer('triggered_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
    windowDays: integer('window_days'),
    seriesId: integer('series_id').references(() => series.id, { onDelete: 'cascade' }),
    releasesTotal: integer('releases_total').notNull().default(0),
    releasesFlipped: integer('releases_flipped').notNull().default(0),
    releasesRescored: integer('releases_rescored').notNull().default(0),
    weightsSnapshotJson: text('weights_snapshot_json').notNull(),
    adultFilterSnapshotJson: text('adult_filter_snapshot_json').notNull(),
    errorMessage: text('error_message'),
  },
  (t) => ({
    triggeredAtIdx: index('replay_runs_triggered_at_idx').on(t.triggeredAt),
    statusIdx: index('replay_runs_status_idx').on(t.status),
    seriesIdIdx: index('replay_runs_series_id_idx').on(t.seriesId),
  }),
);

export type ReplayRunRow = typeof replayRuns.$inferSelect;

export const releaseMatchReplays = sqliteTable(
  'release_match_replays',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    replayRunId: integer('replay_run_id')
      .notNull()
      .references(() => replayRuns.id, { onDelete: 'cascade' }),
    releaseId: integer('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    oldScore: integer('old_score'),
    newScore: integer('new_score'),
    oldWouldGrab: integer('old_would_grab', { mode: 'boolean' }).notNull(),
    newWouldGrab: integer('new_would_grab', { mode: 'boolean' }).notNull(),
    changedKind: text('changed_kind', { enum: ['flipped', 'rescored'] }).notNull(),
    adoptedAt: integer('adopted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    runKindIdx: index('release_match_replays_run_kind_idx').on(t.replayRunId, t.changedKind),
    releaseIdx: index('release_match_replays_release_idx').on(t.releaseId),
  }),
);

export type ReleaseMatchReplayRow = typeof releaseMatchReplays.$inferSelect;

// ============================================================
// M34 tables — mobile bearer auth + exchange-code handshake
// ============================================================

export const mobileTokens = sqliteTable(
  'mobile_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    label: text('label'),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('mobile_tokens_token_hash_uniq').on(table.tokenHash),
    refreshHashUnique: uniqueIndex('mobile_tokens_refresh_hash_uniq').on(table.refreshTokenHash),
    userIdx: index('mobile_tokens_user_idx').on(table.userId),
  }),
);

export type MobileTokenRow = typeof mobileTokens.$inferSelect;

export const mobileExchangeCodes = sqliteTable(
  'mobile_exchange_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    codeHash: text('code_hash').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    codeHashUnique: uniqueIndex('mobile_exchange_codes_code_hash_uniq').on(table.codeHash),
    expiresIdx: index('mobile_exchange_codes_expires_idx').on(table.expiresAt),
  }),
);

export type MobileExchangeCodeRow = typeof mobileExchangeCodes.$inferSelect;

export const mobilePushDevices = sqliteTable(
  'mobile_push_devices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceToken: text('device_token').notNull(),
    platform: text('platform', { enum: ['ios', 'android'] }).notNull(),
    snsEndpointArn: text('sns_endpoint_arn'),
    registeredAt: integer('registered_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    userTokenUnique: uniqueIndex('mobile_push_devices_user_token_uniq').on(
      table.userId,
      table.deviceToken,
    ),
    userIdx: index('mobile_push_devices_user_idx').on(table.userId),
  }),
);

export type MobilePushDeviceRow = typeof mobilePushDevices.$inferSelect;

// ============================================================
// DS11b-1 — per-user notification preferences
// ============================================================

export const userNotificationPreferences = sqliteTable('user_notification_preferences', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventGrabSuccess: integer('event_grab_success', { mode: 'boolean' }).notNull().default(true),
  eventImportSuccess: integer('event_import_success', { mode: 'boolean' }).notNull().default(true),
  eventFailure: integer('event_failure', { mode: 'boolean' }).notNull().default(true),
  eventUpdateAvailable: integer('event_update_available', { mode: 'boolean' })
    .notNull()
    .default(false),
  channel: text('channel', { enum: ['email', 'push', 'webhook'] }).notNull().default('email'),
});

export type UserNotificationPreferencesRow = typeof userNotificationPreferences.$inferSelect;

// ============================================================
// DS11b-2 — personal API keys
// ============================================================

export const personalApiKeys = sqliteTable(
  'personal_api_keys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  },
  (table) => ({
    keyHashIdx: uniqueIndex('personal_api_keys_hash_uniq').on(table.keyHash),
    userIdx: index('personal_api_keys_user_idx').on(table.userId),
  }),
);

export type PersonalApiKeyRow = typeof personalApiKeys.$inferSelect;

// ============================================================
// Dashboard/Profile (task 2) — reading goals + activity events
// ============================================================

/**
 * Per-user reading goals. One row per user (userId is the PK). Both targets are
 * nullable — null means "no goal set" (the dashboard ring renders empty). The
 * yearly-books ring tracks the current-year finished count; the weekly-minutes
 * ring tracks this-week reading minutes.
 */
export const readingGoals = sqliteTable('reading_goals', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  yearlyBooks: integer('yearly_books'),
  weeklyMinutes: integer('weekly_minutes'),
  streakDays: integer('streak_days'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type ReadingGoalsRow = typeof readingGoals.$inferSelect;

/**
 * Per-user dashboard layout preferences. One row per user (userId is the PK).
 * `orderJson` is a JSON array of widget ids in display order; `enabledJson` is a
 * JSON object mapping widget id → boolean. Both are stored as text and merged
 * over the canonical default at read time, so the stored blob is robust to the
 * widget set changing (unknown ids dropped, new ids default to enabled).
 */
export const dashboardPrefs = sqliteTable('dashboard_prefs', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  orderJson: text('order_json').notNull(),
  enabledJson: text('enabled_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type DashboardPrefsRow = typeof dashboardPrefs.$inferSelect;

/**
 * Household activity feed events. Emitted best-effort from the reader finish
 * path, series-add, importer success, and grabber success.
 *
 * `userId` is nullable: job-context emitters (importer/grabber) run without a
 * session, so those events are attributed to no user (rendered as a "system"
 * event without an avatar in the feed). `userId`/`volumeId` use `set null` on
 * delete so individual user/volume removals don't cascade the whole event row.
 * `seriesId` uses `cascade` so that deleting a series also cleans up its feed
 * history — stale feed items for deleted series are not useful and linger as
 * orphaned noise otherwise.
 */
export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    seriesId: integer('series_id').references(() => series.id, { onDelete: 'cascade' }),
    volumeId: integer('volume_id').references(() => volumes.id, { onDelete: 'set null' }),
    metaJson: text('meta_json').notNull().default('{}'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    createdAtIdx: index('activity_events_created_at_idx').on(table.createdAt),
    userCreatedIdx: index('activity_events_user_created_idx').on(table.userId, table.createdAt),
  }),
);

export type ActivityEventRow = typeof activityEvents.$inferSelect;

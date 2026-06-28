CREATE TABLE `chapters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`volume_id` integer,
	`number_text` text NOT NULL,
	`number_sort` real NOT NULL,
	`title` text,
	`release_date` integer,
	`mangadex_chapter_id` text,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`volume_id`) REFERENCES `volumes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_series_sort_uniq` ON `chapters` (`series_id`,`number_sort`);--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`release_id` integer NOT NULL,
	`qbt_hash` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`added_at` integer NOT NULL,
	`completed_at` integer,
	`imported_at` integer,
	`error` text,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `downloads_qbt_hash_uniq` ON `downloads` (`qbt_hash`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`scheduled_for` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`error` text,
	`attempt` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_kind_status_idx` ON `jobs` (`kind`,`status`);--> statement-breakpoint
CREATE INDEX `jobs_scheduled_for_idx` ON `jobs` (`scheduled_for`);--> statement-breakpoint
CREATE TABLE `library_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`volume_id` integer,
	`chapter_id` integer,
	`path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`hash_sha1` text,
	`imported_at` integer NOT NULL,
	`source_release_id` integer,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`volume_id`) REFERENCES `volumes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_files_path_uniq` ON `library_files` (`path`);--> statement-breakpoint
CREATE TABLE `quality_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`prefer_complete_batches` integer DEFAULT false NOT NULL,
	`preferred_groups_json` text DEFAULT '[]' NOT NULL,
	`preferred_languages_json` text DEFAULT '["en"]' NOT NULL,
	`min_size_mb` integer,
	`max_size_mb` integer,
	`prefer_originals` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer,
	`indexer_id` integer NOT NULL,
	`indexer_guid` text NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_low` real,
	`target_high` real,
	`group_name` text,
	`language` text,
	`size_bytes` integer NOT NULL,
	`seeders` integer DEFAULT 0 NOT NULL,
	`leechers` integer DEFAULT 0 NOT NULL,
	`published_at` integer NOT NULL,
	`score` real,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_indexer_guid_uniq` ON `releases` (`indexer_id`,`indexer_guid`);--> statement-breakpoint
CREATE INDEX `releases_series_idx` ON `releases` (`series_id`);--> statement-breakpoint
CREATE TABLE `scan_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_path` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`proposed_series_id` integer,
	`proposed_volume` integer,
	`proposed_chapter` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`parser_debug_json` text DEFAULT '{}' NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`proposed_series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_matches_path_uniq` ON `scan_matches` (`file_path`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`anilist_id` integer NOT NULL,
	`mangadex_id` text,
	`title_english` text,
	`title_romaji` text,
	`title_native` text,
	`status` text NOT NULL,
	`cover_url` text,
	`description` text,
	`total_volumes` integer,
	`total_chapters` integer,
	`root_path` text NOT NULL,
	`monitoring` text DEFAULT 'all' NOT NULL,
	`granularity` text DEFAULT 'volume' NOT NULL,
	`quality_profile_id` integer NOT NULL,
	`extra_search_terms_json` text DEFAULT '[]' NOT NULL,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`quality_profile_id`) REFERENCES `quality_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_anilist_id_uniq` ON `series` (`anilist_id`);--> statement-breakpoint
CREATE TABLE `volumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text,
	`release_date` integer,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `volumes_series_number_uniq` ON `volumes` (`series_id`,`number`);
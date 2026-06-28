PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_type` text DEFAULT 'manga' NOT NULL,
	`anilist_id` integer,
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
INSERT INTO `__new_series`("id", "content_type", "anilist_id", "mangadex_id", "title_english", "title_romaji", "title_native", "status", "cover_url", "description", "total_volumes", "total_chapters", "root_path", "monitoring", "granularity", "quality_profile_id", "extra_search_terms_json", "added_at", "updated_at") SELECT "id", 'manga', "anilist_id", "mangadex_id", "title_english", "title_romaji", "title_native", "status", "cover_url", "description", "total_volumes", "total_chapters", "root_path", "monitoring", "granularity", "quality_profile_id", "extra_search_terms_json", "added_at", "updated_at" FROM `series`;--> statement-breakpoint
DROP TABLE `series`;--> statement-breakpoint
ALTER TABLE `__new_series` RENAME TO `series`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `series_anilist_id_uniq` ON `series` (`anilist_id`);
DROP INDEX `reading_stats_daily_user_day_uniq`;--> statement-breakpoint
ALTER TABLE `reading_stats_daily` ADD `content_type` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `reading_stats_daily_user_day_type_uniq` ON `reading_stats_daily` (`user_id`,`day`,`content_type`);
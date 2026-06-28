CREATE TABLE `reading_stats_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`day` text NOT NULL,
	`seconds_read` integer DEFAULT 0 NOT NULL,
	`units_read` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_stats_daily_user_day_uniq` ON `reading_stats_daily` (`user_id`,`day`);--> statement-breakpoint
CREATE INDEX `reading_stats_daily_user_day_idx` ON `reading_stats_daily` (`user_id`,`day`);
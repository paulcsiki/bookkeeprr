CREATE TABLE `reading_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`readable_key` text NOT NULL,
	`series_id` integer NOT NULL,
	`volume_id` integer,
	`library_file_id` integer,
	`content_type` text NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`locator_json` text DEFAULT 'null' NOT NULL,
	`finished` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`volume_id`) REFERENCES `volumes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`library_file_id`) REFERENCES `library_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_progress_user_key_uniq` ON `reading_progress` (`user_id`,`readable_key`);--> statement-breakpoint
CREATE INDEX `reading_progress_user_updated_idx` ON `reading_progress` (`user_id`,`updated_at`);
CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`kind` text NOT NULL,
	`series_id` integer,
	`volume_id` integer,
	`meta_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`volume_id`) REFERENCES `volumes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_events_created_at_idx` ON `activity_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `activity_events_user_created_idx` ON `activity_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reading_goals` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`yearly_books` integer,
	`weekly_minutes` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

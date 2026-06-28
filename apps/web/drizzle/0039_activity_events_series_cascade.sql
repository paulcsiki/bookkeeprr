PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`kind` text NOT NULL,
	`series_id` integer,
	`volume_id` integer,
	`meta_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`volume_id`) REFERENCES `volumes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_activity_events`("id", "user_id", "kind", "series_id", "volume_id", "meta_json", "created_at") SELECT "id", "user_id", "kind", "series_id", "volume_id", "meta_json", "created_at" FROM `activity_events`;--> statement-breakpoint
DROP TABLE `activity_events`;--> statement-breakpoint
ALTER TABLE `__new_activity_events` RENAME TO `activity_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `activity_events_created_at_idx` ON `activity_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `activity_events_user_created_idx` ON `activity_events` (`user_id`,`created_at`);
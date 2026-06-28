DROP INDEX `reading_progress_user_key_uniq`;--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `device_id` text;--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `device_name` text;--> statement-breakpoint
CREATE UNIQUE INDEX `reading_progress_user_key_device_uniq` ON `reading_progress` (`user_id`,`readable_key`,`device_id`);
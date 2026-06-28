CREATE TABLE `library_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `library_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_groups_parent_name_uniq` ON `library_groups` (`parent_id`,`name`);--> statement-breakpoint
ALTER TABLE `scan_matches` ADD `scan_root_path` text;--> statement-breakpoint
ALTER TABLE `scan_matches` ADD `target_group_id` integer;--> statement-breakpoint
ALTER TABLE `scan_matches` ADD `structure` text;--> statement-breakpoint
ALTER TABLE `series` ADD `group_id` integer REFERENCES library_groups(id);
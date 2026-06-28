CREATE TABLE `chapter_read` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`chapter_id` integer NOT NULL,
	`read_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_read_user_chapter_uniq` ON `chapter_read` (`user_id`,`chapter_id`);--> statement-breakpoint
CREATE INDEX `chapter_read_user_idx` ON `chapter_read` (`user_id`);
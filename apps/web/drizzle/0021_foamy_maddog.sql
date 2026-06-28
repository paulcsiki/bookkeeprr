CREATE TABLE `personal_api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_api_keys_hash_uniq` ON `personal_api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `personal_api_keys_user_idx` ON `personal_api_keys` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_path` text;
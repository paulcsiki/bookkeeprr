CREATE TABLE `mobile_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`label` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_tokens_token_hash_uniq` ON `mobile_tokens` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_tokens_refresh_hash_uniq` ON `mobile_tokens` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `mobile_tokens_user_idx` ON `mobile_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `mobile_exchange_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_exchange_codes_code_hash_uniq` ON `mobile_exchange_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `mobile_exchange_codes_expires_idx` ON `mobile_exchange_codes` (`expires_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_changelog_version` text;
